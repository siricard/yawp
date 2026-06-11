defmodule Yawp.Federation.NotificationEnvelope do
  @moduledoc false

  @sources ["room_message", "room_mention", "dm"]

  @spec build(map()) :: {:ok, map()} | {:error, :invalid_notification}
  def build(attrs) when is_map(attrs) do
    envelope = %{
      "envelope_id" => Map.get(attrs, :envelope_id) || Map.get(attrs, "envelope_id") || new_id(),
      "kind" => "notification",
      "user_did" => Map.get(attrs, :user_did) || Map.get(attrs, "user_did"),
      "source" => Map.get(attrs, :source) || Map.get(attrs, "source"),
      "source_server" => Map.get(attrs, :source_server) || Map.get(attrs, "source_server"),
      "room_id_or_thread_id" =>
        Map.get(attrs, :room_id_or_thread_id) || Map.get(attrs, "room_id_or_thread_id"),
      "message_id" => Map.get(attrs, :message_id) || Map.get(attrs, "message_id"),
      "timestamp" => Map.get(attrs, :timestamp) || Map.get(attrs, "timestamp")
    }

    with :ok <- validate(envelope),
         {:ok, signature, key_id} <- Yawp.Federation.sign(envelope) do
      encoded = Base.url_encode64(signature, padding: false)

      {:ok,
       envelope
       |> Map.put("signed_by", key_id)
       |> Map.put("signature", encoded)
       |> Map.put("source_server_signature", encoded)}
    else
      _ -> {:error, :invalid_notification}
    end
  end

  def build(_), do: {:error, :invalid_notification}

  defp new_id, do: "notif_" <> Ecto.UUID.generate()

  defp validate(%{
         "envelope_id" => envelope_id,
         "user_did" => user_did,
         "source" => source,
         "source_server" => source_server,
         "room_id_or_thread_id" => room_or_thread,
         "message_id" => message_id,
         "timestamp" => timestamp
       })
       when is_binary(envelope_id) and envelope_id != "" and is_binary(user_did) and
              user_did != "" and source in @sources and
              is_binary(source_server) and source_server != "" and
              is_binary(room_or_thread) and room_or_thread != "" and
              is_binary(message_id) and message_id != "" and is_binary(timestamp) and
              timestamp != "" do
    :ok
  end

  defp validate(_), do: :error
end
