defmodule Yawp.Identity.IdentityTest do
  @moduledoc """
  `Yawp.Identity.Identity` device-subkey schema + `:bind_device`
  action. reshape lays down the columns (device_subkeys jsonb,
  anchor_list array, profile_version counter) and the device-binding
  action that verifies the master-key delegation signature. will
  extend this action with the full RPC wire shape; the
  base-resource invariants tested here are the foundation.
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

  defp sign_delegation(sk, device_id, device_pk_bytes, issued_at) do
    payload = %{
      "device_id" => device_id,
      "pk" => Base.url_encode64(device_pk_bytes, padding: false),
      "issued_at" => DateTime.to_iso8601(issued_at)
    }

    canonical = Yawp.CanonicalJson.encode(payload)
    :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])
  end

  defp bind_args(master_sk, opts \\ []) do
    device_id = Keyword.get(opts, :device_id, Ecto.UUID.generate())
    {device_pk, _device_sk} = :crypto.generate_key(:eddsa, :ed25519)
    issued_at = DateTime.utc_now()
    sig = sign_delegation(master_sk, device_id, device_pk, issued_at)

    %{
      device_id: device_id,
      device_pk: Base.url_encode64(device_pk, padding: false),
      device_signature: Base.url_encode64(sig, padding: false),
      issued_at: issued_at,
      anchor_url: Keyword.get(opts, :anchor_url, "https://anchor.example.com")
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
    test "appends subkey, appends anchor_url, bumps profile_version" do
      %{identity: identity, master_sk: sk} = seed_identity!()
      args = bind_args(sk)

      assert {:ok, updated} = Identity.bind_device(identity, args)

      subkeys = updated.device_subkeys["subkeys"]
      assert length(subkeys) == 1
      sub = hd(subkeys)
      assert sub["device_id"] == args.device_id
      assert sub["pk"] == args.device_pk
      assert sub["signature"] == args.device_signature
      assert is_binary(sub["issued_at"])

      assert updated.anchor_list == [args.anchor_url]
      assert updated.profile_version == 1
    end
  end

  describe "bind_device (idempotency)" do
    test "re-binding the same device_id is a no-op (first-write-wins, no version bump)" do
      %{identity: identity, master_sk: sk} = seed_identity!()
      args = bind_args(sk)

      {:ok, after_first} = Identity.bind_device(identity, args)
      assert after_first.profile_version == 1
      assert length(after_first.device_subkeys["subkeys"]) == 1

                              args2 = %{args | issued_at: DateTime.add(args.issued_at, 60, :second)}

      new_sig =
        sign_delegation(
          sk,
          args.device_id,
          Base.url_decode64!(args.device_pk, padding: false),
          args2.issued_at
        )

      args2 = %{args2 | device_signature: Base.url_encode64(new_sig, padding: false)}

      {:ok, after_second} = Identity.bind_device(after_first, args2)

      assert length(after_second.device_subkeys["subkeys"]) == 1
            assert after_second.anchor_list == [args.anchor_url]
            assert after_second.profile_version == 1

            sub = hd(after_second.device_subkeys["subkeys"])
      assert sub["signature"] == args.device_signature
    end
  end

  describe "bind_device (signature verification)" do
    test "mismatched device signature returns an invalid-changeset error mentioning device_signature" do
      %{identity: identity, master_sk: sk} = seed_identity!()
      args = bind_args(sk)

            {_other_pk, other_sk} = :crypto.generate_key(:eddsa, :ed25519)

      bad_sig =
        sign_delegation(
          other_sk,
          args.device_id,
          Base.url_decode64!(args.device_pk, padding: false),
          args.issued_at
        )

      bad = %{args | device_signature: Base.url_encode64(bad_sig, padding: false)}

      assert {:error, error} = Identity.bind_device(identity, bad)
      message = Exception.message(error)
      assert message =~ "device_signature" or message =~ "invalid_signature"
    end
  end

  describe "bind_device (multiple anchors)" do
    test "binding to a different anchor_url appends rather than replaces" do
      %{identity: identity, master_sk: sk} = seed_identity!()
      args_a = bind_args(sk, anchor_url: "https://a.example.com")
      {:ok, after_a} = Identity.bind_device(identity, args_a)
      assert after_a.anchor_list == ["https://a.example.com"]

            args_b = bind_args(sk, anchor_url: "https://b.example.com")
      {:ok, after_b} = Identity.bind_device(after_a, args_b)

      assert "https://a.example.com" in after_b.anchor_list
      assert "https://b.example.com" in after_b.anchor_list
      assert length(after_b.anchor_list) == 2
      assert length(after_b.device_subkeys["subkeys"]) == 2
      assert after_b.profile_version == 2
    end
  end
end
