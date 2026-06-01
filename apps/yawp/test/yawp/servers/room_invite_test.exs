defmodule Yawp.Servers.RoomInviteTest do
  @moduledoc """
  `Yawp.Servers.RoomInvite` resource + create_invite / redeem actions.

  Exercises:
    * minting a channel-level invite gated by the `create_invite` bit,
    * the `:redeem` generic action verifies the ed25519 sender signature,
      auto-promotes a stranger to a guest membership, and grants channel
      read access via an identity-level override,
    * the error vocabulary (invalid / consumed / exhausted / expired /
      revoked),
    * single-use vs multi-use semantics,
    * the warm-invite DM payload builder shape,
    * the cold-invite URL builder.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions
  alias Yawp.Servers.RoomInvite

  require Ash.Query

  setup do
    :ok = Servers.Seeder.run()
    {:ok, server} = Servers.get_singleton_server()

    {:ok, channel} =
      Servers.Channel
      |> Ash.Changeset.for_create(:create, %{
        server_id: server.id,
        name: "secret",
        type: :text,
        visibility: :private
      })
      |> Ash.create(authorize?: false)

    %{server: server, channel: channel}
  end

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp owner!(server) do
    owner = seed_identity!()
    {:ok, _} = Servers.set_server_owner(server, owner.did)
    {:ok, role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [role.id])
    owner
  end

  defp stranger_member!(server) do
    m = seed_identity!()
    {:ok, role} = Servers.get_system_role_for_server("Member", server.id)
    # Member does not get manage anything; but does get create_invite at
    # server level. To test create_invite gate failure we strip the role.
    {:ok, _} = Servers.assign_role(m.id, server.id, [role.id])
    m
  end

  defp build_redeem_args(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    canonical =
      Yawp.CanonicalJson.encode(%{"token" => token, "did" => did, "pk" => pk_b64})

    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])

    %{
      token: token,
      did: did,
      pk: pk_b64,
      sender_signature: Base.url_encode64(sig, padding: false),
      _pk_bytes: pk
    }
  end

  defp do_redeem(args) do
    RoomInvite
    |> Ash.ActionInput.for_action(:redeem, %{
      token: args.token,
      did: args.did,
      pk: args.pk,
      sender_signature: args.sender_signature
    })
    |> Ash.run_action(authorize?: false)
  end

  describe "create_invite" do
    test "owner mints a channel invite with defaults", %{server: server, channel: channel} do
      owner = owner!(server)

      {:ok, invite} =
        Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      assert is_binary(invite.token)
      assert String.length(invite.token) == 26
      assert invite.kind == :single_use
      assert invite.channel_id == channel.id
      assert invite.server_id == server.id
      assert invite.created_by_identity_id == owner.id
      assert invite.consumed_at == nil
    end

    test "rejects mint without an actor (not_authenticated)", %{channel: channel} do
      assert {:error, error} = Servers.create_room_invite(%{channel_id: channel.id})
      assert error_type(error) == "not_authenticated"
    end

    test "rejects mint by an identity lacking create_invite on the channel",
         %{server: server, channel: channel} do
      stranger = stranger_member!(server)

      # Deny create_invite for the Member role on this channel via override.
      {:ok, member_role} = Servers.get_system_role_for_server("Member", server.id)

      {:ok, _} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          deny_bits: Permissions.bit(:create_invite)
        })

      assert {:error, error} =
               Servers.create_room_invite(%{channel_id: channel.id}, actor: stranger)

      assert error_type(error) == "missing_permission"
    end
  end

  describe "redeem (success)" do
    test "auto-promotes a stranger to guest + grants channel read",
         %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      args = build_redeem_args(invite.token)

      assert {:ok, %{server_id: sid, channel_id: cid, kind: kind}} = do_redeem(args)
      assert sid == server.id
      assert cid == channel.id
      assert kind == "guest"

      identity = Yawp.Identity.get_identity_by_did!(args.did)

      membership =
        Yawp.Servers.Membership
        |> Ash.Query.filter(identity_id == ^identity.id and server_id == ^server.id)
        |> Ash.read_one!(authorize?: false)

      assert membership.kind == :guest

      # The guest can now read the private channel they could not see before.
      bits = Permissions.effective_bits(identity, server, channel)
      assert Permissions.has?(bits, :read_messages)

      {:ok, refetched} = Servers.get_room_invite_by_id(invite.id)
      assert refetched.consumed_at != nil
    end

    test "existing member keeps their membership kind on redeem",
         %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      # Pre-seed a redeemer as an anchored member.
      args = build_redeem_args(invite.token)

      redeemer =
        Ash.Seed.seed!(Yawp.Identity.Identity, %{did: args.did, master_public_key: args._pk_bytes})

      {:ok, member_role} = Servers.get_system_role_for_server("Member", server.id)
      {:ok, _} = Servers.assign_role(redeemer.id, server.id, [member_role.id])

      assert {:ok, %{kind: kind}} = do_redeem(args)
      assert kind == "anchored"

      membership =
        Yawp.Servers.Membership
        |> Ash.Query.filter(identity_id == ^redeemer.id and server_id == ^server.id)
        |> Ash.read_one!(authorize?: false)

      assert membership.kind == :anchored
    end

    test "multi-use decrements and exhausts", %{server: server, channel: channel} do
      owner = owner!(server)

      {:ok, invite} =
        Servers.create_room_invite(
          %{channel_id: channel.id, kind: :multi_use, uses_remaining: 2},
          actor: owner
        )

      assert {:ok, _} = do_redeem(build_redeem_args(invite.token))
      assert {:ok, _} = do_redeem(build_redeem_args(invite.token))
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

    test "invite_token_consumed on replay", %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      assert {:ok, _} = do_redeem(build_redeem_args(invite.token))
      assert {:error, error} = do_redeem(build_redeem_args(invite.token))
      assert error_type(error) == "invite_token_consumed"
    end

    test "invite_token_revoked", %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)
      {:ok, _} = Servers.revoke_room_invite(invite)

      assert {:error, error} = do_redeem(build_redeem_args(invite.token))
      assert error_type(error) == "invite_token_revoked"
    end

    test "invalid_signature when signature does not verify",
         %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      args = build_redeem_args(invite.token)
      {_pk2, sk2} = :crypto.generate_key(:eddsa, :ed25519)

      bad_sig =
        :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(%{"a" => 1}), [sk2, :ed25519])

      bad = %{args | sender_signature: Base.url_encode64(bad_sig, padding: false)}
      assert {:error, error} = do_redeem(bad)
      assert error_type(error) == "invalid_signature"
    end
  end

  describe "warm + cold invite payloads" do
    test "warm_invite_payload/2 builds the structured DM shape",
         %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      payload = RoomInvite.warm_invite_payload(invite, "anchor.example")

      assert payload["type"] == "room_invite"
      assert payload["token"] == invite.token
      assert payload["channel_id"] == channel.id
      assert payload["server_id"] == server.id
      assert payload["url"] == "yawp://anchor.example/r/#{channel.id}?token=#{invite.token}"
    end

    test "cold_invite_url/2 builds the yawp scheme link",
         %{server: server, channel: channel} do
      owner = owner!(server)
      {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

      url = RoomInvite.cold_invite_url(invite, "anchor.example")
      assert url == "yawp://anchor.example/r/#{channel.id}?token=#{invite.token}"
    end
  end

  defp error_type(error) do
    cond do
      is_struct(error, Yawp.RpcError) ->
        to_string(error.type)

      is_struct(error, Ash.Error.Invalid) ->
        Enum.find_value(error.errors, fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      is_struct(error, Ash.Error.Forbidden) ->
        Enum.find_value(error.errors, fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      true ->
        nil
    end
  end
end
