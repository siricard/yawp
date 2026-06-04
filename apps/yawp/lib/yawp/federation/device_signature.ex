defmodule Yawp.Federation.DeviceSignature do
  @moduledoc false

  alias Yawp.CanonicalJson
  alias Yawp.Federation.Client
  alias Yawp.Federation.InnerSignature
  alias Yawp.Identity

  @spec verify(map()) ::
          :ok | {:error, :invalid_inner_signature | :unresolvable_sender}
  def verify(envelope) when is_map(envelope) do
    with sender_did when is_binary(sender_did) <- Map.get(envelope, "sender_did", :missing),
         signed_by when is_binary(signed_by) and signed_by != "" <-
           Map.get(envelope, "signed_by", :missing),
         sig_b64 when is_binary(sig_b64) <- Map.get(envelope, "sender_signature", :missing),
         {:ok, sig} <- decode(sig_b64, 64),
         {:ok, ppe} <- resolve_sender_ppe(sender_did, envelope),
         {:ok, device_pk} <- device_pk_from_ppe(ppe, signed_by),
         true <- verify_signature(envelope, sig, device_pk) do
      :ok
    else
      {:error, :unresolvable_sender} -> {:error, :unresolvable_sender}
      _ -> {:error, :invalid_inner_signature}
    end
  end

  def verify(_envelope), do: {:error, :invalid_inner_signature}

  defp resolve_sender_ppe(sender_did, envelope) do
    case Identity.get_ppe_by_did(sender_did) do
      {:ok, %Identity.Ppe{envelope: cached}} when is_map(cached) ->
        {:ok, cached}

      _ ->
        fetch_sender_ppe(sender_did, sender_anchors(envelope))
    end
  end

  defp fetch_sender_ppe(_sender_did, []), do: {:error, :unresolvable_sender}

  defp fetch_sender_ppe(sender_did, [anchor | rest]) do
    case fetch_and_apply(anchor, sender_did) do
      {:ok, envelope} -> {:ok, envelope}
      {:error, _} -> fetch_sender_ppe(sender_did, rest)
    end
  end

  defp fetch_and_apply(anchor, sender_did) do
    with {:ok, envelope} <- Client.fetch_ppe!(anchor, sender_did),
         true <- Map.get(envelope, "did") == sender_did,
         :ok <- InnerSignature.verify(envelope, "did", "signature"),
         {:ok, _status} <- Identity.apply_ppe_if_newer(envelope) do
      {:ok, envelope}
    else
      _ -> {:error, :unusable_ppe}
    end
  end

  defp sender_anchors(envelope) do
    case Map.get(envelope, "sender_anchors") do
      anchors when is_list(anchors) -> Enum.filter(anchors, &(is_binary(&1) and &1 != ""))
      _ -> []
    end
  end

  defp device_pk_from_ppe(ppe, signed_by) do
    subkeys =
      case Map.get(ppe, "device_subkeys") do
        list when is_list(list) -> list
        _ -> []
      end

    case Enum.find(subkeys, fn s -> is_map(s) and Map.get(s, "device_id") == signed_by end) do
      %{"pk" => pk_b64} -> decode(pk_b64, 32)
      _ -> :error
    end
  end

  defp verify_signature(envelope, sig, device_pk) do
    canonical =
      envelope
      |> Map.delete("sender_signature")
      |> CanonicalJson.encode()

    :crypto.verify(:eddsa, :none, canonical, sig, [device_pk, :ed25519])
  rescue
    _ -> false
  end

  defp decode(value, byte_length) when is_binary(value) do
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

  defp decode(_value, _byte_length), do: :error
end
