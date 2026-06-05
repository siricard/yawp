defmodule Yawp.Federation.DmEnvelopeTest do
  use ExUnit.Case, async: true

  alias Yawp.Federation.DmEnvelope

  @alice "did:yawp:alice"
  @bob "did:yawp:bob"
  @carol "did:yawp:carol"

  test "conversation_id derives from the sorted unique participant set" do
    expected =
      :crypto.hash(:sha256, Yawp.CanonicalJson.encode([@alice, @bob, @carol]))
      |> Base.encode16(case: :lower)

    assert DmEnvelope.conversation_id(@alice, [@bob, @carol, @bob]) == expected
    assert DmEnvelope.conversation_id(@bob, [@carol, @alice]) == expected
  end

  test "new envelope ids are 128-bit random base64url strings" do
    envelope_id = DmEnvelope.generate_envelope_id()

    assert String.match?(envelope_id, ~r/^[A-Za-z0-9_-]{22}$/)
    assert {:ok, <<_::128>>} = Base.url_decode64(envelope_id, padding: false)
  end

  test "sign/2 signs canonical envelope bytes and verify/2 accepts delegated device subkeys" do
    {master_pk, master_sk} = :crypto.generate_key(:eddsa, :ed25519)
    {device_pk, device_sk} = :crypto.generate_key(:eddsa, :ed25519)
    issued_at = "2026-06-04T12:00:00.000Z"
    device_id = "phone-1"
    device_pk_b64 = Base.url_encode64(device_pk, padding: false)

    delegation =
      %{"device_id" => device_id, "pk" => device_pk_b64, "issued_at" => issued_at}
      |> Yawp.CanonicalJson.encode()
      |> then(&:crypto.sign(:eddsa, :none, &1, [master_sk, :ed25519]))
      |> Base.url_encode64(padding: false)

    ppe = %{
      "public_key" => Base.url_encode64(master_pk, padding: false),
      "device_subkeys" => [
        %{
          "device_id" => device_id,
          "pk" => device_pk_b64,
          "issued_at" => issued_at,
          "signature" => delegation
        }
      ]
    }

    envelope = %DmEnvelope{
      envelope_id: DmEnvelope.generate_envelope_id(),
      sender_did: @alice,
      recipient_dids: [@bob],
      conversation_id: DmEnvelope.conversation_id(@alice, [@bob]),
      timestamp: "2026-06-04T12:00:01.000Z",
      body: "hello",
      attachments: [],
      reply_to: nil,
      mentions: []
    }

    assert {:ok, signed} = DmEnvelope.sign(envelope, device_sk)
    assert String.match?(signed.sender_signature, ~r/^[A-Za-z0-9_-]+$/)
    assert :ok = DmEnvelope.verify(signed, ppe)
    assert {:error, :invalid_signature} = DmEnvelope.verify(%{signed | body: "tampered"}, ppe)

    mismatched =
      %{signed | conversation_id: DmEnvelope.conversation_id(@alice, [@carol])}
      |> then(fn envelope ->
        assert {:ok, resigned} = DmEnvelope.sign(envelope, device_sk)
        resigned
      end)

    assert {:error, :invalid_signature} = DmEnvelope.verify(mismatched, ppe)
  end
end
