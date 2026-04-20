defmodule Yawp.Identity.IdentityTest do
  @moduledoc """
   + — `Yawp.Identity.Identity` device-subkey schema +
  `:bind_device` action exercised through the code interface.
  reshapes the action into an RPC action with a
  `sender_signature` gate; the schema-level invariants (device
  subkeys jsonb, anchor_list array, profile_version counter) and the
  master-key delegation verification covered here are the foundation
  the RPC layer rides on. RPC-envelope behavior is exercised by
  `bind_device_rpc_test.exs`.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity

  defp seed_identity!(_ \\ %{}) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

    %{identity: identity, master_pk: pk, master_sk: sk, did: did}
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

  defp bind_args(master_sk, did, opts \\ []) do
    device_id = Keyword.get(opts, :device_id, Ecto.UUID.generate())
    {device_pk, device_sk} = :crypto.generate_key(:eddsa, :ed25519)
    issued_at = DateTime.utc_now()
    issued_at_iso = DateTime.to_iso8601(issued_at)
    device_sig = sign_delegation(master_sk, device_id, device_pk, issued_at_iso)
    device_pk_b64 = Base.url_encode64(device_pk, padding: false)
    device_sig_b64 = Base.url_encode64(device_sig, padding: false)

    canonical_body =
      Yawp.CanonicalJson.encode(%{
        "did" => did,
        "device_id" => device_id,
        "device_pk" => device_pk_b64,
        "device_signature" => device_sig_b64,
        "issued_at" => issued_at_iso
      })

    sender_sig = :crypto.sign(:eddsa, :none, canonical_body, [device_sk, :ed25519])

    %{
      device_id: device_id,
      device_pk: device_pk_b64,
      device_signature: device_sig_b64,
      sender_signature: Base.url_encode64(sender_sig, padding: false),
      issued_at: issued_at
    }
  end

  describe "schema" do
    test "new Identity rows default device_subkeys, anchor_list, profile_version" do
      %{identity: identity} = seed_identity!()

      assert identity.device_subkeys == %{"subkeys" => []}
      assert identity.anchor_list == []
      assert identity.profile_version == 0
    end
  end

  describe "bind_device (happy path)" do
    test "appends subkey, appends server's anchor_url, bumps profile_version" do
      %{identity: identity, master_sk: sk, did: did} = seed_identity!()
      args = bind_args(sk, did)

      assert {:ok, updated} = Identity.bind_device(identity, args)

      subkeys = updated.device_subkeys["subkeys"]
      assert length(subkeys) == 1
      sub = hd(subkeys)
      assert sub["device_id"] == args.device_id
      assert sub["pk"] == args.device_pk
      assert sub["signature"] == args.device_signature
      assert is_binary(sub["issued_at"])

            assert updated.anchor_list == [YawpWeb.Endpoint.url()]
      assert updated.profile_version == 1
    end
  end

  describe "bind_device (idempotency)" do
    test "re-binding the same device_id is a no-op (first-write-wins, no version bump)" do
      %{identity: identity, master_sk: sk, did: did} = seed_identity!()
      args = bind_args(sk, did)

      {:ok, after_first} = Identity.bind_device(identity, args)
      assert after_first.profile_version == 1
      assert length(after_first.device_subkeys["subkeys"]) == 1

            args2 = bind_args(sk, did, device_id: args.device_id)
      {:ok, after_second} = Identity.bind_device(after_first, args2)

      assert length(after_second.device_subkeys["subkeys"]) == 1
      assert after_second.anchor_list == [YawpWeb.Endpoint.url()]
            assert after_second.profile_version == 1

            sub = hd(after_second.device_subkeys["subkeys"])
      assert sub["signature"] == args.device_signature
    end
  end

  describe "bind_device (delegation verification)" do
    test "mismatched device delegation is rejected" do
      %{identity: identity, master_sk: _sk, did: did} = seed_identity!()

            {_other_pk, other_sk} = :crypto.generate_key(:eddsa, :ed25519)
      args = bind_args(other_sk, did)

      assert {:error, error} = Identity.bind_device(identity, args)
      message = Exception.message(error)
      assert message =~ "invalid_device_delegation" or message =~ "device_signature"
    end
  end
end
