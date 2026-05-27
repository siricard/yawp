defmodule Yawp.Servers.ServerInviteTest do
  @moduledoc """
  `Yawp.Servers.ServerInvite` resource + mint/redeem domain
  actions.

  Exercises:
    * minting produces a 26-char base32 token with the right defaults,
    * the `:redeem` generic action verifies the ed25519 sender
      signature and assigns the Member role on success,
    * the -style error vocabulary
      (`invite_token_invalid | invite_token_consumed |
      invite_token_exhausted | invite_token_expired |
      invite_token_revoked`),
    * single-use vs multi-use semantics,
    * concurrent redemption of a single-use token: exactly one winner.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.ServerInvite

  setup do
    :ok = Servers.Seeder.run()

    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    owner = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

    {:ok, server} = Servers.get_singleton_server()
    {:ok, owner_role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, owner_role.id)

    %{server: server, owner: owner}
  end

  defp build_redeem_args(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    canonical =
      Yawp.CanonicalJson.encode(%{
        "token" => token,
        "did" => did,
        "pk" => pk_b64
      })

    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])

    %{
      token: token,
      did: did,
      pk: pk_b64,
      sender_signature: Base.url_encode64(sig, padding: false),
      _pk_bytes: pk,
      _sk_bytes: sk
    }
  end

  defp do_redeem(args) do
    ServerInvite
    |> Ash.ActionInput.for_action(:redeem, %{
      token: args.token,
      did: args.did,
      pk: args.pk,
      sender_signature: args.sender_signature
    })
    |> Ash.run_action(authorize?: false)
  end

  describe "mint" do
    test "produces a 26-char base32 token, single-use, 24h TTL", %{
      server: server,
      owner: owner
    } do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      assert is_binary(invite.token)
      assert String.length(invite.token) == 26
      assert invite.token =~ ~r/^[A-Z2-7]+$/
      assert invite.kind == :single_use
      assert invite.consumed_at == nil
      assert invite.revoked_at == nil
      assert invite.server_id == server.id
                  assert invite.created_by_identity_id == owner.id

      ttl_seconds = DateTime.diff(invite.expires_at, DateTime.utc_now())
      assert ttl_seconds in (24 * 60 * 60 - 60)..(24 * 60 * 60)
    end

    test "multi-use with uses_remaining cap", %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(
          %{
            server_id: server.id,
            kind: :multi_use,
            uses_remaining: 3
          },
          actor: owner
        )

      assert invite.kind == :multi_use
      assert invite.uses_remaining == 3
      assert invite.created_by_identity_id == owner.id
    end

    test "rejects mint without an actor (not_authenticated)", %{server: server} do
      assert {:error, error} =
               Servers.mint_server_invite(%{server_id: server.id})

      assert error_type(error) == "not_authenticated"
    end

    test "rejects mint with non-Identity actor (not_authenticated)", %{server: server} do
      assert {:error, error} =
               Servers.mint_server_invite(%{server_id: server.id}, actor: %{id: "bogus"})

      assert error_type(error) == "not_authenticated"
    end

    test "rejects mint by non-owner identity (not_server_owner)", %{server: server} do
            {pk2, _sk2} = :crypto.generate_key(:eddsa, :ed25519)
      did2 = "did:yawp:" <> Identity.did_from_pubkey(pk2)
      non_owner = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did2, master_public_key: pk2})

      assert {:error, error} =
               Servers.mint_server_invite(%{server_id: server.id}, actor: non_owner)

      assert error_type(error) == "not_server_owner"
    end

    test "rejects multi-use without uses_remaining", %{server: server, owner: owner} do
      assert {:error, error} =
               Servers.mint_server_invite(
                 %{server_id: server.id, kind: :multi_use},
                 actor: owner
               )

      assert match?(%Ash.Error.Invalid{}, error)
    end

    test "rejects multi-use with uses_remaining = 0", %{server: server, owner: owner} do
      assert {:error, error} =
               Servers.mint_server_invite(
                 %{server_id: server.id, kind: :multi_use, uses_remaining: 0},
                 actor: owner
               )

      assert match?(%Ash.Error.Invalid{}, error)
    end
  end

  describe "redeem (success)" do
    test "single-use: assigns Member, marks consumed, returns server_id+role",
         %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      args = build_redeem_args(invite.token)

      assert {:ok, %{server_id: server_id, role: role}} = do_redeem(args)
      assert server_id == server.id
      assert role == "Member"

            {:ok, refetched} = Servers.get_server_invite_by_id(invite.id)
      assert refetched.consumed_at != nil

            identity = Yawp.Identity.get_identity_by_did!(args.did)
      assert identity.master_public_key == args._pk_bytes

            {:ok, role_row} = Servers.get_system_role_for_server("Member", server.id)
      require Ash.Query

      memberships =
        Yawp.Servers.Membership
        |> Ash.Query.filter(
          identity_id == ^identity.id and server_id == ^server.id and role_id == ^role_row.id
        )
        |> Ash.read!(authorize?: false)

      assert length(memberships) == 1
    end

    test "multi-use: decrements uses_remaining and consumes on zero",
         %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id, kind: :multi_use, uses_remaining: 2},
          actor: owner
        )

      assert {:ok, _} = do_redeem(build_redeem_args(invite.token))
      {:ok, after_first} = Servers.get_server_invite_by_id(invite.id)
      assert after_first.uses_remaining == 1
      assert after_first.consumed_at == nil

      assert {:ok, _} = do_redeem(build_redeem_args(invite.token))
      {:ok, after_second} = Servers.get_server_invite_by_id(invite.id)
      assert after_second.uses_remaining == 0
      assert after_second.consumed_at != nil

            assert {:error, error} = do_redeem(build_redeem_args(invite.token))
      assert error_type(error) == "invite_token_exhausted"
    end
  end

  describe "redeem (errors)" do
    test "invite_token_invalid for unknown token" do
      args = build_redeem_args("NOSUCHTOKEN12345678901234")
      assert {:error, error} = do_redeem(args)
      assert error_type(error) == "invite_token_invalid"
    end

    test "invite_token_consumed on replay", %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      args = build_redeem_args(invite.token)
      assert {:ok, _} = do_redeem(args)

      args2 = build_redeem_args(invite.token)
      assert {:error, error} = do_redeem(args2)
      assert error_type(error) == "invite_token_consumed"
    end

    test "invite_token_expired", %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      {:ok, _} =
        invite
        |> Ash.Changeset.for_update(:force_expire, %{expires_at: past})
        |> Ash.update(authorize?: false)

      args = build_redeem_args(invite.token)
      assert {:error, error} = do_redeem(args)
      assert error_type(error) == "invite_token_expired"
    end

    test "invite_token_revoked", %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      {:ok, _} = Servers.revoke_server_invite(invite)

      args = build_redeem_args(invite.token)
      assert {:error, error} = do_redeem(args)
      assert error_type(error) == "invite_token_revoked"
    end

    test "invalid_signature when sender_signature does not verify",
         %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      args = build_redeem_args(invite.token)
      {_pk2, sk2} = :crypto.generate_key(:eddsa, :ed25519)

      bad_sig =
        :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(%{"a" => 1}), [sk2, :ed25519])

      bad_args = %{args | sender_signature: Base.url_encode64(bad_sig, padding: false)}
      assert {:error, error} = do_redeem(bad_args)
      assert error_type(error) == "invalid_signature"
    end
  end

  describe "redeem concurrent (single-use)" do
    test "exactly one of N concurrent redeemers wins; rest get invite_token_consumed",
         %{server: server, owner: owner} do
      {:ok, invite} =
        Servers.mint_server_invite(%{server_id: server.id}, actor: owner)

      parent = self()
      n = 4

            args_list = for _ <- 1..n, do: build_redeem_args(invite.token)

      results =
        args_list
        |> Enum.map(fn args ->
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())
            do_redeem(args)
          end)
        end)
        |> Task.await_many(15_000)

      ok = Enum.count(results, &match?({:ok, _}, &1))

      consumed =
        Enum.count(results, fn r ->
          case r do
            {:error, error} -> error_type(error) == "invite_token_consumed"
            _ -> false
          end
        end)

      assert ok == 1,
             "expected exactly one winner, got #{ok} winners; results=#{inspect(results)}"

      assert ok + consumed == n
    end
  end

  
  defp error_type(error) do
    cond do
      is_struct(error, Yawp.RpcError) ->
        to_string(error.type)

      is_struct(error, Ash.Error.Invalid) ->
        error.errors
        |> Enum.find_value(fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      true ->
        nil
    end
  end
end
