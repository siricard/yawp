defmodule Yawp.Auth do
  @moduledoc """
  Authentication primitives for the Yawp channel handshake.

  See `docs/` for the wire-format ADR.

  This module exposes:

    * `verify_signature/3` — Ed25519 signature check via Erlang's
      `:crypto.verify/5` (`:eddsa`, `:sha512`, curve `:ed25519`).
    * `validate_payload/1` — rejects any payload that contains a
      `private_key` field anywhere in its structure. The Yawp server is
      keyless by design: a client must never send a private key to the
      server, and the server must never accept one.
  """

  @typedoc "An Ed25519 public key as 32 raw bytes."
  @type pubkey :: binary()

  @typedoc "An Ed25519 signature as 64 raw bytes."
  @type signature :: binary()

  @doc """
  Verify an Ed25519 signature over `message`.

  Returns `:ok` on success or `{:error, :invalid_signature}` on any
  failure (bad signature, wrong message, wrong key, or malformed bytes).
  """
  @spec verify_signature(binary(), signature(), pubkey()) ::
          :ok | {:error, :invalid_signature}
  def verify_signature(message, signature, pubkey)
      when is_binary(message) and is_binary(signature) and is_binary(pubkey) do
    if :crypto.verify(:eddsa, :sha512, message, signature, [pubkey, :ed25519]) do
      :ok
    else
      {:error, :invalid_signature}
    end
  rescue
    _ -> {:error, :invalid_signature}
  end

  @doc """
  Validate a wire payload by rejecting anything containing a
  `private_key` field (string or atom key) at any nesting level.

  Returns `{:ok, payload}` if clean, `{:error, :forbidden_field}` otherwise.
  """
  @spec validate_payload(term()) :: {:ok, term()} | {:error, :forbidden_field}
  def validate_payload(payload) do
    if contains_private_key?(payload) do
      {:error, :forbidden_field}
    else
      {:ok, payload}
    end
  end

  defp contains_private_key?(map) when is_map(map) do
    Enum.any?(map, fn {k, v} ->
      private_key_key?(k) or contains_private_key?(v)
    end)
  end

  defp contains_private_key?(list) when is_list(list) do
    Enum.any?(list, &contains_private_key?/1)
  end

  defp contains_private_key?({_k, v}), do: contains_private_key?(v)
  defp contains_private_key?(_), do: false

  defp private_key_key?("private_key"), do: true
  defp private_key_key?(:private_key), do: true
  defp private_key_key?(_), do: false
end
