defmodule Mook.AuthTest do
  use ExUnit.Case, async: true

  alias Mook.Auth

            @fixture_path Path.join([
                  :code.priv_dir(:mook) |> to_string(),
                  "test_vectors",
                  "identity.json"
                ])

          setup_all do
    vector = @fixture_path |> File.read!() |> Jason.decode!()

    {:ok,
     vector_pk: Base.decode16!(vector["pk_hex"], case: :lower),
     vector_message: vector["signature_message_utf8"],
     vector_signature: Base.decode16!(vector["signature_hex"], case: :lower)}
  end

  describe "verify_signature/3" do
    test "returns :ok for a valid Ed25519 signature (cross-platform vector)", ctx do
      assert Auth.verify_signature(
               ctx.vector_message,
               ctx.vector_signature,
               ctx.vector_pk
             ) == :ok
    end

    test "returns {:error, :invalid_signature} for a tampered signature", ctx do
      <<first, rest::binary>> = ctx.vector_signature
      tampered = <<Bitwise.bxor(first, 0x01)>> <> rest

      assert Auth.verify_signature(ctx.vector_message, tampered, ctx.vector_pk) ==
               {:error, :invalid_signature}
    end

    test "returns {:error, :invalid_signature} when the message is tampered", ctx do
      assert Auth.verify_signature("not-the-message", ctx.vector_signature, ctx.vector_pk) ==
               {:error, :invalid_signature}
    end

    test "returns {:error, :invalid_signature} when the public key doesn't match", ctx do
      other_pk = :crypto.strong_rand_bytes(32)

      assert Auth.verify_signature(ctx.vector_message, ctx.vector_signature, other_pk) ==
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
