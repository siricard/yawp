defmodule Yawp.Identity.ClaimChatOwnerRpcTest do
  @moduledoc """
  `:claim_chat_owner` RPC action on
  `Yawp.Identity.Identity`. Replaces the deleted
  `YawpWeb.ClaimController` end-to-end tests; the action is invoked via
  `AshTypescript.Rpc.run_action/3` against a bare `Plug.Conn`.

  Wire shape: `%{"action" => "claim_chat_owner", "input" => %{
    "claimToken" => ..., "did" => ..., "pk" => ..., "senderSignature" => ...
  }}` — fields are camelCase per the ash_typescript input formatter.

  Success: `%{success: true, data: %{...}}`.
  Failure: `%{success: false, errors: [%{type: "<slug>", ...}, ...]}`.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Admin

  @password "correct horse battery staple"

  defp create_account!(email \\ "op@example.com") do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  defp issue_token!(account) do
    {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
    claim
  end

  defp build_input(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    payload = %{"claim_token" => token, "did" => did, "pk" => pk_b64}
    canonical = Yawp.CanonicalJson.encode(payload)
    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])
    sig_b64 = Base.url_encode64(sig, padding: false)

    {%{
       "claimToken" => token,
       "did" => did,
       "pk" => pk_b64,
       "senderSignature" => sig_b64
     }, pk}
  end

  defp run(input) do
    AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
      "action" => "claim_chat_owner",
      "fields" => ["id", "did"],
      "input" => input
    })
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp data(result), do: Map.get(result, :data) || Map.get(result, "data")
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  describe "claim_chat_owner (success)" do
    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "happy path: persists Identity, assigns Owner role, consumes token, writes audit" do
      account = create_account!()
      claim = issue_token!(account)
      {input, pk} = build_input(claim.token)

      result = run(input)

      assert success?(result) == true
      d = data(result)
      assert is_map(d)
      did = Map.get(d, :did) || Map.get(d, "did")
      assert did == input["did"]
      id = Map.get(d, :id) || Map.get(d, "id")
      assert is_binary(id)

            identity = Yawp.Identity.get_identity_by_did!(did)
      assert identity.master_public_key == pk
      assert identity.id == id

            {:ok, server} = Yawp.Servers.get_singleton_server()
      {:ok, owner_role} = Yawp.Servers.get_system_role_for_server("Owner", server.id)

      require Ash.Query

      memberships =
        Yawp.Servers.Membership
        |> Ash.Query.filter(
          identity_id == ^identity.id and server_id == ^server.id and role_id == ^owner_role.id
        )
        |> Ash.read!(authorize?: false)

      assert length(memberships) == 1

            {:ok, refetched} = Admin.get_claim_token_by_id(claim.id)
      assert refetched.consumed_at != nil

            {:ok, entries} = Admin.list_recent_audit_entries()
      consume = Enum.find(entries, &(&1.action == "claim_token.consume"))
      assert consume
      assert Map.get(consume.payload, "did") == did or Map.get(consume.payload, :did) == did
    end

    test "replay with the same input returns claim_token_consumed" do
      account = create_account!()
      claim = issue_token!(account)
      {input, _pk} = build_input(claim.token)

      assert success?(run(input)) == true
      result = run(input)
      assert success?(result) == false
      assert "claim_token_consumed" in error_types(result)
    end
  end

  describe "claim_chat_owner (errors)" do
    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "invalid_payload: pk not 32 bytes" do
      bad = %{
        "claimToken" => "X",
        "did" => "did:yawp:abc",
        "pk" => Base.url_encode64(<<1, 2, 3>>, padding: false),
        "senderSignature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false)
      }

      result = run(bad)
      assert "invalid_payload" in error_types(result)
    end

    test "invalid_payload: bad base64 in pk" do
      bad = %{
        "claimToken" => "X",
        "did" => "did:yawp:abc",
        "pk" => "!!!not base64!!!",
        "senderSignature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false)
      }

      result = run(bad)
      assert "invalid_payload" in error_types(result)
    end

    test "claim_token_invalid for unknown token" do
      {input, _pk} = build_input("NOSUCHTOKEN")
      result = run(input)
      assert "claim_token_invalid" in error_types(result)
    end

    test "claim_token_revoked for a revoked token" do
      account = create_account!()
      claim = issue_token!(account)
      {:ok, _} = Admin.revoke_claim_token(claim)

      {input, _pk} = build_input(claim.token)
      result = run(input)

      assert "claim_token_invalid" in error_types(result) or
               "claim_token_revoked" in error_types(result)

                            end

    test "claim_token_expired for an expired token" do
      account = create_account!()
      claim = issue_token!(account)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      {:ok, _} =
        claim
        |> Ash.Changeset.for_update(:force_expire, %{expires_at: past})
        |> Ash.update(authorize?: false)

      {input, _pk} = build_input(claim.token)
      result = run(input)
      assert "claim_token_expired" in error_types(result)
    end

    test "did_mismatch when DID does not match pk" do
      account = create_account!()
      claim = issue_token!(account)
      {input, _pk} = build_input(claim.token)
      bad = Map.put(input, "did", "did:yawp:WRONG")

      result = run(bad)
                        types = error_types(result)
      assert "did_mismatch" in types or "invalid_signature" in types
    end

    test "invalid_signature when signature does not verify" do
      account = create_account!()
      claim = issue_token!(account)
      {input, _pk} = build_input(claim.token)

      {_pk2, sk2} = :crypto.generate_key(:eddsa, :ed25519)

      bad_sig =
        :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(%{"a" => 1}), [sk2, :ed25519])

      bad = Map.put(input, "senderSignature", Base.url_encode64(bad_sig, padding: false))

      result = run(bad)
      assert "invalid_signature" in error_types(result)
    end
  end

  describe "claim_chat_owner concurrent" do
    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "N concurrent valid calls with the same token create exactly one Identity + one Owner membership" do
      account = create_account!("op-concurrent@example.com")
      claim = issue_token!(account)
      n = 4

      inputs = for _ <- 1..n, do: build_input(claim.token) |> elem(0)
      parent = self()

      results =
        inputs
        |> Task.async_stream(
          fn input ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())

            res =
              AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
                "action" => "claim_chat_owner",
                "fields" => ["id", "did"],
                "input" => input
              })

            {success?(res), res, input["did"]}
          end,
          max_concurrency: n,
          timeout: :infinity,
          ordered: false
        )
        |> Enum.map(fn {:ok, r} -> r end)

      successes = Enum.filter(results, fn {ok, _r, _did} -> ok == true end)
      failures = Enum.filter(results, fn {ok, _r, _did} -> ok == false end)

      assert length(successes) == 1,
             "expected exactly 1 successful claim, got #{length(successes)}; results=#{inspect(results)}"

      assert length(successes) + length(failures) == n

      {_ok, _res, winning_did} = hd(successes)

            identities =
        Yawp.Identity.Identity
        |> Ash.Query.for_read(:read)
        |> Ash.read!(authorize?: false)

      assert length(identities) == 1
      assert hd(identities).did == winning_did

            {:ok, server} = Yawp.Servers.get_singleton_server()
      {:ok, owner_role} = Yawp.Servers.get_system_role_for_server("Owner", server.id)
      require Ash.Query

      memberships =
        Yawp.Servers.Membership
        |> Ash.Query.filter(server_id == ^server.id and role_id == ^owner_role.id)
        |> Ash.read!(authorize?: false)

      assert length(memberships) == 1
      assert hd(memberships).identity_id == hd(identities).id

            {:ok, refetched} = Admin.get_claim_token_by_id(claim.id)
      assert refetched.consumed_at != nil

            failure_types =
        failures
        |> Enum.flat_map(fn {_ok, res, _did} -> error_types(res) end)

      assert Enum.all?(failure_types, &(&1 == "claim_token_consumed"))
    end
  end
end
