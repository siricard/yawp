defmodule Yawp.Identity do
  @moduledoc """
  Client identity primitives shared across the Yawp server and clients,
  and the Ash domain hosting identity-bearing resources.

  ## DID derivation

  A user's decentralized identifier (DID) is derived deterministically from
  their Ed25519 public key:

      did = base58(SHA-256(public_key_bytes))

  The same derivation is implemented on web (`@noble/ed25519` + `@noble/hashes`
  + `bs58`) and React Native. The canonical test vector lives at
  `priv/test_vectors/identity.json` and is consumed by tests on every platform.

  ## Domain

  This module also serves as the Ash domain hosting the
  identity-bearing resources (PPE bundle, private blob, device subkeys,
  etc.). only adds the bare `Yawp.Identity.Identity` resource
  stub; richer behavior lands+. See ADRs 005–007.
  """

  use Ash.Domain, otp_app: :yawp

  resources do
    resource Yawp.Identity.Identity do
      define :claim_chat_owner, action: :upsert_chat_owner
      define :get_chat_owner, action: :get_chat_owner, not_found_error?: false
      define :get_identity_by_did, action: :get_by_did, args: [:did]
    end
  end

  @base58_alphabet ~c"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

  @doc """
  Returns the DID for the given 32-byte Ed25519 public key.

  The DID is the base58 encoding (Bitcoin alphabet) of the SHA-256 hash of the
  raw public key bytes.
  """
  @spec did_from_pubkey(binary()) :: String.t()
  def did_from_pubkey(pubkey) when is_binary(pubkey) do
    pubkey
    |> hash()
    |> base58_encode()
  end

  defp hash(bytes), do: :crypto.hash(:sha256, bytes)

  @doc false
  @spec base58_encode(binary()) :: String.t()
  def base58_encode(<<>>), do: ""

  def base58_encode(bytes) when is_binary(bytes) do
    leading_zeros = count_leading_zeros(bytes, 0)
    int = :binary.decode_unsigned(bytes, :big)

    encoded =
      int
      |> encode_int([])
      |> List.to_string()

    String.duplicate(<<Enum.at(@base58_alphabet, 0)>>, leading_zeros) <> encoded
  end

  defp encode_int(0, []), do: [Enum.at(@base58_alphabet, 0)]
  defp encode_int(0, acc), do: acc

  defp encode_int(n, acc) do
    encode_int(div(n, 58), [Enum.at(@base58_alphabet, rem(n, 58)) | acc])
  end

  defp count_leading_zeros(<<0, rest::binary>>, n), do: count_leading_zeros(rest, n + 1)
  defp count_leading_zeros(_, n), do: n
end
