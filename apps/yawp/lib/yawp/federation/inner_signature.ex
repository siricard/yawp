defmodule Yawp.Federation.InnerSignature do
  alias Yawp.CanonicalJson
  alias Yawp.Identity

  @spec verify(map(), String.t(), String.t()) :: :ok | {:error, :invalid_inner_signature}
  def verify(payload, id_field, sig_field)
      when is_map(payload) and is_binary(id_field) and is_binary(sig_field) do
    with did when is_binary(did) <- Map.get(payload, id_field, :missing),
         pk_value when is_binary(pk_value) <- Map.get(payload, "public_key", :missing),
         {:ok, pk} <- decode_key(pk_value, 32),
         sig_b64 when is_binary(sig_b64) <- Map.get(payload, sig_field, :missing),
         {:ok, sig} <- decode_key(sig_b64, 64),
         :ok <- verify_did_binding(did, pk),
         true <- verify_signature(payload, sig_field, sig, pk) do
      :ok
    else
      _ -> {:error, :invalid_inner_signature}
    end
  end

  def verify(_payload, _id_field, _sig_field), do: {:error, :invalid_inner_signature}

  defp verify_did_binding(did, pk) do
    if did == "did:yawp:" <> Identity.did_from_pubkey(pk) do
      :ok
    else
      {:error, :invalid_inner_signature}
    end
  end

  defp verify_signature(payload, sig_field, sig, pk) do
    canonical =
      payload
      |> Map.delete(sig_field)
      |> CanonicalJson.encode()

    :crypto.verify(:eddsa, :none, canonical, sig, [pk, :ed25519])
  rescue
    _ -> false
  end

  defp decode_key(value, byte_length) when is_binary(value) do
    raw = String.replace_prefix(value, "ed25519:", "")

    decoded =
      case Base.url_decode64(raw, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(raw, padding: false)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == byte_length -> {:ok, bytes}
      _ -> :error
    end
  end

  defp decode_key(_value, _byte_length), do: :error
end
