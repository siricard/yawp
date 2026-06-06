defmodule Yawp.Federation.DeviceSignatureTest do
  use Yawp.DataCase, async: true

  alias Yawp.Federation.DeviceSignature
  alias Yawp.Identity

  defp keypair, do: :crypto.generate_key(:eddsa, :ed25519)

  defp did_for(pub), do: "did:yawp:" <> Identity.did_from_pubkey(pub)

  defp b64(bytes), do: Base.url_encode64(bytes, padding: false)

  defp sign_inner(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, b64(sig))
  end

  defp sign_device_delegation(device_id, device_pub, issued_at, master_priv) do
    canonical =
      Yawp.CanonicalJson.encode(%{
        "device_id" => device_id,
        "pk" => b64(device_pub),
        "issued_at" => issued_at
      })

    :crypto.sign(:eddsa, :none, canonical, [master_priv, :ed25519])
  end

  defp seed_ppe(master_pub, master_priv, device_pub, device_id, opts \\ []) do
    anchors = Keyword.get(opts, :anchors, ["anchor-a.example"])
    issued_at = Keyword.get(opts, :issued_at, "2026-01-01T00:00:00Z")

    signature =
      Keyword.get_lazy(opts, :device_signature, fn ->
        sign_device_delegation(device_id, device_pub, issued_at, master_priv)
      end)

    ppe =
      %{
        "did" => did_for(master_pub),
        "profile_version" => Keyword.get(opts, :version, 1),
        ("public_" <> "key") => b64(master_pub),
        "anchors" => anchors,
        "display_name" => "Sender",
        "device_subkeys" => [
          %{
            "device_id" => device_id,
            "pk" => b64(device_pub),
            "signature" => b64(signature),
            "issued_at" => issued_at
          }
        ]
      }
      |> sign_inner("signature", master_priv)

    {:ok, _} = Identity.apply_ppe_if_newer(ppe)
    ppe
  end

  defp envelope(master_pub, device_priv, device_id, attrs \\ %{}) do
    %{
      "envelope_id" => "env-#{System.unique_integer([:positive])}",
      "sender_did" => did_for(master_pub),
      "signed_by" => device_id,
      "recipient_did" => "did:yawp:recipient",
      "conversation_id" => "conv-1",
      "kind" => "dm",
      "body" => "hello"
    }
    |> Map.merge(attrs)
    |> sign_inner("sender_signature", device_priv)
  end

  test "accepts a DM signed by a device subkey published in the sender's cached PPE" do
    {master_pub, master_priv} = keypair()
    {device_pub, device_priv} = keypair()
    device_id = "device-1"

    seed_ppe(master_pub, master_priv, device_pub, device_id)
    env = envelope(master_pub, device_priv, device_id)

    assert :ok = DeviceSignature.verify(env)
  end

  test "accepts a client envelope whose device id and sender anchors are covered by the signature" do
    {master_pub, master_priv} = keypair()
    {device_pub, device_priv} = keypair()
    device_id = "client-device-1"

    seed_ppe(master_pub, master_priv, device_pub, device_id, version: 7)

    env =
      envelope(master_pub, device_priv, device_id, %{
        "recipient_dids" => ["did:yawp:recipient"],
        "conversation_id" => "conv-client",
        "timestamp" => "2026-06-06T00:00:00.000Z",
        "attachments" => [],
        "reply_to" => nil,
        "mentions" => [],
        "sender_anchors" => ["localhost:4000"],
        "sender_profile_version" => 7
      })

    assert :ok = DeviceSignature.verify(env)

    assert {:error, :invalid_inner_signature} =
             env
             |> Map.put("signed_by", "client-device-2")
             |> DeviceSignature.verify()
  end

  test "rejects a DM signed by the master key rather than a device subkey" do
    {master_pub, master_priv} = keypair()
    {device_pub, _device_priv} = keypair()
    device_id = "device-1"

    seed_ppe(master_pub, master_priv, device_pub, device_id)
    env = envelope(master_pub, master_priv, device_id)

    assert {:error, :invalid_inner_signature} = DeviceSignature.verify(env)
  end

  test "rejects a DM whose published device subkey lacks a valid master delegation" do
    {master_pub, master_priv} = keypair()
    {device_pub, device_priv} = keypair()
    device_id = "device-1"

    seed_ppe(master_pub, master_priv, device_pub, device_id,
      device_signature: :crypto.strong_rand_bytes(64)
    )

    env = envelope(master_pub, device_priv, device_id)

    assert {:error, :invalid_inner_signature} = DeviceSignature.verify(env)
  end

  test "rejects a DM whose signing device is not a published subkey of the sender" do
    {master_pub, master_priv} = keypair()
    {device_pub, _device_priv} = keypair()
    {rogue_pub, rogue_priv} = keypair()

    seed_ppe(master_pub, master_priv, device_pub, "device-1")

    env =
      envelope(master_pub, rogue_priv, "rogue-device", %{})
      |> Map.put("signed_by", "rogue-device")
      |> sign_inner("sender_signature", rogue_priv)

    _ = rogue_pub
    assert {:error, :invalid_inner_signature} = DeviceSignature.verify(env)
  end

  test "rejects a DM mutated after the device signed it" do
    {master_pub, master_priv} = keypair()
    {device_pub, device_priv} = keypair()
    device_id = "device-1"

    seed_ppe(master_pub, master_priv, device_pub, device_id)

    env =
      envelope(master_pub, device_priv, device_id)
      |> Map.put("body", "tampered")

    assert {:error, :invalid_inner_signature} = DeviceSignature.verify(env)
  end

  test "rejects a DM whose sender PPE cannot be resolved from cache or any anchor" do
    {master_pub, _master_priv} = keypair()
    {_device_pub, device_priv} = keypair()

    env = envelope(master_pub, device_priv, "device-1")

    assert {:error, :unresolvable_sender} = DeviceSignature.verify(env)
  end

  test "rejects a non-map, missing signed_by, and missing sender_signature without crashing" do
    assert {:error, :invalid_inner_signature} = DeviceSignature.verify("nope")
    assert {:error, :invalid_inner_signature} = DeviceSignature.verify(%{"sender_did" => "x"})
  end
end
