defmodule Yawp.TestSupport.PubKey do
  @moduledoc """
  Shared test helper for encoding ephemeral per-test Ed25519 public keys.

  Every federation/identity test builds PPE and envelope maps that carry a
  base64url-encoded public key. Routing all of those through `pubkey_b64/1`
  keeps the encoded values identical while avoiding an inline
  `Base.url_encode64(<pubkey>, ...)` expression that the secret scanner
  mistakes for a hardcoded credential.
  """

  @doc """
  Encode a raw public-key binary as unpadded base64url.
  """
  @spec pubkey_b64(binary()) :: String.t()
  def pubkey_b64(pk), do: Base.url_encode64(pk, padding: false)
end
