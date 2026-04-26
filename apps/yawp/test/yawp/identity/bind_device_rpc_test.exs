defmodule Yawp.Identity.BindDeviceRpcTest do
  @moduledoc """
  `:bind_device` RPC action on `Yawp.Identity.Identity` (ADR
  028). Pre-auth RPC: the request body is signed by the device subkey
  (`sender_signature`), the delegation body (`{device_id, pk, issued_at}`)
  is signed by the master key (`device_signature`). On success the
  action issues a session+refresh pair returned via action metadata.

  Wire shape: `%{"action" => "bind_device",
                 "getBy" => %{"did" => "did:yawp:..."},
                 "input" => %{
                   "deviceId" => ..., "devicePk" => ...,
                   "deviceSignature" => ...,
                   "senderSignature" => ..., "issuedAt" => ...
                 }}`.

  Errors surface via `result.errors[0].type`. Tokens surface via
  `result.metadata.{sessionToken, refreshToken, expiresAt}`.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity

  defp seed_identity!() do
    {master_pk, master_sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(master_pk)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: master_pk})

    %{identity: identity, master_pk: master_pk, master_sk: master_sk, did: did}
  end

  defp sign_delegation(master_sk, device_id, device_pk_bytes, issued_at_iso) do
    payload = %{
      "device_id" => device_id,
      "pk" => Base.url_encode64(device_pk_bytes, padding: false),
      "issued_at" => issued_at_iso
    }

    canonical = Yawp.CanonicalJson.encode(payload)
    :crypto.sign(:eddsa, :none, canonical, [master_sk, :ed25519])
  end

  defp build_input(opts) do
    master_sk = Keyword.fetch!(opts, :master_sk)
    did = Keyword.fetch!(opts, :did)
    device_id = Keyword.get(opts, :device_id, Ecto.UUID.generate())

    {device_pk_bytes, device_sk_bytes} = :crypto.generate_key(:eddsa, :ed25519)

    issued_at_iso =
      Keyword.get_lazy(opts, :issued_at_iso, fn -> DateTime.to_iso8601(DateTime.utc_now()) end)

    device_sig = sign_delegation(master_sk, device_id, device_pk_bytes, issued_at_iso)
    device_pk_b64 = Base.url_encode64(device_pk_bytes, padding: false)
    device_sig_b64 = Base.url_encode64(device_sig, padding: false)

            canonical_body =
      Yawp.CanonicalJson.encode(%{
        "did" => did,
        "device_id" => device_id,
        "device_pk" => device_pk_b64,
        "device_signature" => device_sig_b64,
        "issued_at" => issued_at_iso
      })

    sender_sig = :crypto.sign(:eddsa, :none, canonical_body, [device_sk_bytes, :ed25519])
    sender_sig_b64 = Base.url_encode64(sender_sig, padding: false)

    input = %{
      "deviceId" => device_id,
      "devicePk" => device_pk_b64,
      "deviceSignature" => device_sig_b64,
      "senderSignature" => sender_sig_b64,
      "issuedAt" => issued_at_iso
    }

    %{
      input: input,
      did: did,
      device_id: device_id,
      device_pk_b64: device_pk_b64,
      device_sig_b64: device_sig_b64,
      sender_sig_b64: sender_sig_b64,
      device_sk: device_sk_bytes
    }
  end

  defp run(did, input) do
    AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
      "action" => "bind_device",
      "identity" => %{"did" => did},
      "fields" => ["id", "did", "profileVersion"],
      "input" => input
    })
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp data(result), do: Map.get(result, :data) || Map.get(result, "data")
  defp metadata(result), do: Map.get(result, :metadata) || Map.get(result, "metadata") || %{}
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  describe "bind_device (success)" do
    test "happy path: appends subkey, anchor_url, bumps version, issues session pair, audit" do
      %{identity: identity, master_sk: master_sk, did: did} = seed_identity!()
      built = build_input(master_sk: master_sk, did: did)

      result = run(did, built.input)
      assert success?(result), inspect(result)

      d = data(result)
      assert (Map.get(d, :did) || Map.get(d, "did")) == did
      assert (Map.get(d, :profileVersion) || Map.get(d, "profileVersion")) == 1

            {:ok, refreshed} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert length(refreshed.device_subkeys["subkeys"]) == 1
      sub = hd(refreshed.device_subkeys["subkeys"])
      assert sub["device_id"] == built.device_id
      assert sub["pk"] == built.device_pk_b64
      assert sub["signature"] == built.device_sig_b64

            server_url = YawpWeb.Endpoint.url()
      assert server_url in refreshed.anchor_list
      assert refreshed.profile_version == 1

            meta = metadata(result)

      session_token =
        Map.get(meta, :sessionToken) || Map.get(meta, "sessionToken") ||
          Map.get(meta, :session_token) || Map.get(meta, "session_token")

      refresh_token =
        Map.get(meta, :refreshToken) || Map.get(meta, "refreshToken") ||
          Map.get(meta, :refresh_token) || Map.get(meta, "refresh_token")

      expires_at =
        Map.get(meta, :expiresAt) || Map.get(meta, "expiresAt") ||
          Map.get(meta, :expires_at) || Map.get(meta, "expires_at")

      assert is_binary(session_token) and byte_size(session_token) > 0
      assert is_binary(refresh_token) and byte_size(refresh_token) > 0
      assert expires_at

            assert {:ok, %Yawp.Identity.Identity{id: id}} = Identity.verify_session(session_token)
      assert id == identity.id

            {:ok, entries} = Yawp.Admin.list_recent_audit_entries()
      bind = Enum.find(entries, &(&1.action == "identity.bind_device"))
      assert bind
      payload = bind.payload

      assert Map.get(payload, "did", Map.get(payload, :did)) == did

      assert Map.get(payload, "device_id", Map.get(payload, :device_id)) ==
               built.device_id
    end
  end

  describe "bind_device (idempotent re-bind)" do
    test "re-binding same device_id is a no-op on subkey list; fresh session pair still issued" do
      %{identity: identity, master_sk: master_sk, did: did} = seed_identity!()
      device_id = Ecto.UUID.generate()

      built_a = build_input(master_sk: master_sk, did: did, device_id: device_id)
      assert success?(run(did, built_a.input))

      built_b = build_input(master_sk: master_sk, did: did, device_id: device_id)
      result = run(did, built_b.input)
      assert success?(result), inspect(result)

      {:ok, refreshed} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
            assert length(refreshed.device_subkeys["subkeys"]) == 1
            assert refreshed.profile_version == 1

      meta = metadata(result)
      session_token = Map.get(meta, :sessionToken) || Map.get(meta, "sessionToken")
      assert is_binary(session_token)
      assert {:ok, _} = Identity.verify_session(session_token)
    end
  end

  describe "bind_device (errors)" do
    test "identity_not_found for an unknown DID" do
      %{master_sk: master_sk} = seed_identity!()
      missing_did = "did:yawp:DOESNOTEXIST"

      built = build_input(master_sk: master_sk, did: missing_did)
      result = run(missing_did, built.input)

      assert success?(result) == false

      types = error_types(result)
      assert "identity_not_found" in types or "not_found" in types
    end

    test "invalid_signature when sender_signature is bogus" do
      %{master_sk: master_sk, did: did} = seed_identity!()
      built = build_input(master_sk: master_sk, did: did)

      {_pk2, sk2} = :crypto.generate_key(:eddsa, :ed25519)
      bogus = :crypto.sign(:eddsa, :none, "junk", [sk2, :ed25519])
      bogus_b64 = Base.url_encode64(bogus, padding: false)

      bad_input = Map.put(built.input, "senderSignature", bogus_b64)
      result = run(did, bad_input)

      assert "invalid_signature" in error_types(result)
    end

    test "invalid_device_delegation when device_signature does not verify against master pk" do
      %{master_sk: _master_sk, did: did} = seed_identity!()
      {_other_pk, other_sk} = :crypto.generate_key(:eddsa, :ed25519)

            built = build_input(master_sk: other_sk, did: did)

      result = run(did, built.input)
      assert "invalid_device_delegation" in error_types(result)
    end

    test "invalid_payload on malformed device_pk" do
      %{master_sk: master_sk, did: did} = seed_identity!()
      built = build_input(master_sk: master_sk, did: did)
      bad_input = Map.put(built.input, "devicePk", "!!!notb64!!!")
      result = run(did, bad_input)
      assert "invalid_payload" in error_types(result)
    end

    test "invalid_payload when issued_at is not parseable ISO-8601" do
      %{master_sk: master_sk, did: did} = seed_identity!()
      built = build_input(master_sk: master_sk, did: did, issued_at_iso: "not-a-date")
      result = run(did, built.input)
      assert success?(result) == false
      assert "invalid_payload" in error_types(result)
    end

    test "invalid_payload when issued_at is more than 5 minutes in the past" do
      %{master_sk: master_sk, did: did} = seed_identity!()
      stale_iso = DateTime.utc_now() |> DateTime.add(-10 * 60, :second) |> DateTime.to_iso8601()
      built = build_input(master_sk: master_sk, did: did, issued_at_iso: stale_iso)
      result = run(did, built.input)
      assert success?(result) == false
      assert "invalid_payload" in error_types(result)
    end

    test "invalid_payload when issued_at is more than 5 minutes in the future" do
      %{master_sk: master_sk, did: did} = seed_identity!()
      future_iso = DateTime.utc_now() |> DateTime.add(10 * 60, :second) |> DateTime.to_iso8601()
      built = build_input(master_sk: master_sk, did: did, issued_at_iso: future_iso)
      result = run(did, built.input)
      assert success?(result) == false
      assert "invalid_payload" in error_types(result)
    end
  end

  describe "bind_device (client-realistic millisecond issued_at)" do
    test "issued_at with millisecond precision (JS Date.toISOString shape) succeeds" do
      %{identity: identity, master_sk: master_sk, did: did} = seed_identity!()
                  ms_iso =
        DateTime.utc_now()
        |> DateTime.truncate(:millisecond)
        |> DateTime.to_iso8601()

      assert String.match?(ms_iso, ~r/\.\d{3}Z$/)

      built = build_input(master_sk: master_sk, did: did, issued_at_iso: ms_iso)
      result = run(did, built.input)

      assert success?(result), inspect(result)

      {:ok, refreshed} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      sub = hd(refreshed.device_subkeys["subkeys"])
            assert sub["issued_at"] == ms_iso
    end
  end

  describe "bind_device (concurrent)" do
    test "concurrent binds of same (did, device_id) — exactly one logical winner, no extras" do
      %{identity: identity, master_sk: master_sk, did: did} = seed_identity!()
      device_id = Ecto.UUID.generate()
      n = 4

      inputs =
        for _ <- 1..n do
          build_input(master_sk: master_sk, did: did, device_id: device_id).input
        end

      parent = self()

      results =
        inputs
        |> Task.async_stream(
          fn input ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())
            run(did, input)
          end,
          max_concurrency: n,
          timeout: :infinity,
          ordered: false
        )
        |> Enum.map(fn {:ok, r} -> r end)

      successes = Enum.filter(results, &success?/1)
                              assert successes != []

      {:ok, refreshed} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert length(refreshed.device_subkeys["subkeys"]) == 1
      assert refreshed.profile_version == 1
    end
  end
end
