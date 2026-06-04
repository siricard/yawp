defmodule Yawp.Federation.InnerSignatureTest do
  use ExUnit.Case, async: true

  import Yawp.TestSupport.PubKey

  alias Yawp.Federation.InnerSignature
  alias Yawp.Identity

  defp keypair, do: :crypto.generate_key(:eddsa, :ed25519)

  defp did_for(pub), do: "did:yawp:" <> Identity.did_from_pubkey(pub)

  defp sign(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, Base.url_encode64(sig, padding: false))
  end

  test "accepts a payload whose signature and DID derive from the inline public key" do
    {pub, priv} = keypair()

    payload =
      sign(
        %{
          "did" => did_for(pub),
          "public_key" => pubkey_b64(pub),
          "profile_version" => 1
        },
        "signature",
        priv
      )

    assert :ok == InnerSignature.verify(payload, "did", "signature")
  end

  test "rejects a payload mutated after signing" do
    {pub, priv} = keypair()

    payload =
      sign(
        %{
          "did" => did_for(pub),
          "public_key" => pubkey_b64(pub),
          "profile_version" => 1
        },
        "signature",
        priv
      )
      |> Map.put("profile_version", 99)

    assert {:error, :invalid_inner_signature} ==
             InnerSignature.verify(payload, "did", "signature")
  end

  test "rejects a payload whose DID does not derive from the public key" do
    {pub, priv} = keypair()
    {other, _} = keypair()

    payload =
      sign(
        %{
          "did" => did_for(other),
          "public_key" => pubkey_b64(pub),
          "profile_version" => 1
        },
        "signature",
        priv
      )

    assert {:error, :invalid_inner_signature} ==
             InnerSignature.verify(payload, "did", "signature")
  end

  test "rejects a payload with no signature field" do
    {pub, _priv} = keypair()

    payload = %{
      "did" => did_for(pub),
      "public_key" => pubkey_b64(pub)
    }

    assert {:error, :invalid_inner_signature} ==
             InnerSignature.verify(payload, "did", "signature")
  end

  test "rejects a payload with a malformed public key" do
    {pub, priv} = keypair()

    payload =
      sign(
        %{
          "did" => did_for(pub),
          "public_key" => "not-a-key",
          "profile_version" => 1
        },
        "signature",
        priv
      )

    assert {:error, :invalid_inner_signature} ==
             InnerSignature.verify(payload, "did", "signature")
  end

  test "rejects non-map input without crashing" do
    assert {:error, :invalid_inner_signature} == InnerSignature.verify("nope", "did", "signature")
    assert {:error, :invalid_inner_signature} == InnerSignature.verify(nil, "did", "signature")
  end

  test "verifies a distinct id field for envelopes" do
    {pub, priv} = keypair()

    payload =
      sign(
        %{
          "sender_did" => did_for(pub),
          "public_key" => pubkey_b64(pub),
          "body" => "hi"
        },
        "sender_signature",
        priv
      )

    assert :ok == InnerSignature.verify(payload, "sender_did", "sender_signature")
  end
end
