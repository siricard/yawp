defmodule Yawp.Federation.NotificationSignature do
  @moduledoc false

  alias Yawp.CanonicalJson
  alias Yawp.Federation.KeyDocFetcher

  @spec verify(map(), String.t()) :: :ok | {:error, :invalid_inner_signature}
  def verify(envelope, source_anchor) when is_map(envelope) and is_binary(source_anchor) do
    with key_id when is_binary(key_id) and key_id != "" <-
           Map.get(envelope, "signed_by", Map.get(envelope, "key_id", :missing)),
         ^source_anchor <- Map.get(envelope, "source_server", :missing),
         :ok <- validate_shape(envelope),
         sig_b64 when is_binary(sig_b64) <- signature(envelope),
         {:ok, sig} <- decode(sig_b64, 64),
         true <- verify_signature(envelope, source_anchor, key_id, sig) do
      :ok
    else
      _ -> {:error, :invalid_inner_signature}
    end
  end

  def verify(_envelope, _source_anchor), do: {:error, :invalid_inner_signature}

  defp validate_shape(%{
         "kind" => "notification",
         "user_did" => user_did,
         "source" => source_kind,
         "source_server" => source_server,
         "room_id_or_thread_id" => room_or_thread,
         "message_id" => message_id,
         "timestamp" => timestamp
       })
       when is_binary(user_did) and user_did != "" and
              source_kind in ["room_message", "room_mention", "dm"] and
              is_binary(source_server) and source_server != "" and
              is_binary(room_or_thread) and room_or_thread != "" and
              is_binary(message_id) and message_id != "" and is_binary(timestamp) and
              timestamp != "" do
    :ok
  end

  defp validate_shape(%{"source_kind" => source_kind} = envelope) do
    envelope
    |> Map.delete("source_kind")
    |> Map.put("source", source_kind)
    |> validate_shape()
  end

  defp validate_shape(_), do: :error

  defp verify_signature(envelope, source_anchor, key_id, sig) do
    canonical = canonical_without_key(envelope)
    legacy = canonical_with_key(envelope)

    KeyDocFetcher.verify_with(source_anchor, key_id, canonical, sig) or
      KeyDocFetcher.verify_with(source_anchor, key_id, legacy, sig)
  rescue
    _ -> false
  catch
    _, _ -> false
  end

  defp canonical_without_key(envelope) do
    envelope
    |> Map.delete("signed_by")
    |> Map.delete("key_id")
    |> canonical_with_key()
  end

  defp canonical_with_key(envelope) do
    envelope
    |> Map.delete("source_server_signature")
    |> Map.delete("signature")
    |> CanonicalJson.encode()
  end

  defp signature(envelope) do
    Map.get(envelope, "signature") || Map.get(envelope, "source_server_signature", :missing)
  end

  defp decode(value, byte_length) when is_binary(value) do
    decoded =
      case Base.url_decode64(value, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(value)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == byte_length -> {:ok, bytes}
      _ -> :error
    end
  end

  defp decode(_value, _byte_length), do: :error
end
