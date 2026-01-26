defmodule Mook.AuthTest do
  use ExUnit.Case, async: true

  alias Mook.Auth

      @vector_pubkey Base.decode16!(
                   "03A107BFF3CE10BE1D70DD18E74BC09967E4D6309BA50D5F1DDC8664125531B8",
                   case: :upper
                 )
  @vector_message "mook-identity-vector-v1"
  @vector_signature Base.decode16!(
                      "95BFE46830AC2740AC7C36FAF857F4FAD522BAE91D13C662CDEDD67A9FDB632C257924E432F2934D60053EDE8D4DF5A28B85FA684EBF11A4541CADD5987E6E02",
                      case: :upper
                    )

  describe "verify_signature/3" do
    test "returns :ok for a valid Ed25519 signature (cross-platform vector)" do
      assert Auth.verify_signature(@vector_message, @vector_signature, @vector_pubkey) == :ok
    end

    test "returns {:error, :invalid_signature} for a tampered signature" do
      <<first, rest::binary>> = @vector_signature
      tampered = <<Bitwise.bxor(first, 0x01)>> <> rest

      assert Auth.verify_signature(@vector_message, tampered, @vector_pubkey) ==
               {:error, :invalid_signature}
    end

    test "returns {:error, :invalid_signature} when the message is tampered" do
      assert Auth.verify_signature("not-the-message", @vector_signature, @vector_pubkey) ==
               {:error, :invalid_signature}
    end

    test "returns {:error, :invalid_signature} when the public key doesn't match" do
      other_pubkey = :crypto.strong_rand_bytes(32)

      assert Auth.verify_signature(@vector_message, @vector_signature, other_pubkey) ==
               {:error, :invalid_signature}
    end
  end

  describe "validate_payload/1 — server never accepts private keys" do
    test "passes a clean payload through" do
      payload = %{"did" => "did:mook:abc", "signature" => "sig"}
      assert Auth.validate_payload(payload) == {:ok, payload}
    end

    test "rejects payload containing string key `private_key`" do
      payload = %{"did" => "did:mook:abc", "private_key" => "leak"}
      assert Auth.validate_payload(payload) == {:error, :forbidden_field}
    end

    test "rejects payload containing atom key `:private_key`" do
      payload = %{did: "did:mook:abc", private_key: "leak"}
      assert Auth.validate_payload(payload) == {:error, :forbidden_field}
    end

    test "rejects payload with `private_key` nested anywhere" do
      payload = %{"did" => "x", "creds" => %{"private_key" => "leak"}}
      assert Auth.validate_payload(payload) == {:error, :forbidden_field}
    end

    test "rejects payload with a private_key inside a list value" do
      payload = %{"did" => "x", "items" => [%{"private_key" => "leak"}]}
      assert Auth.validate_payload(payload) == {:error, :forbidden_field}
    end
  end
end
