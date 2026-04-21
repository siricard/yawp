defmodule YawpWeb.ChannelTopic do
  @moduledoc """
  Phoenix channel for one Yawp text channel.

  Topic: `channel:<channel_id>` where `<channel_id>` is the UUID of a
  `Yawp.Servers.Channel` row.

  On join: authorises the current identity (must have any Membership
  on the channel's parent Server) and pushes the 50 most-recent
  messages as a single `history` event.

  Inbound:
    * `send` — `%{"body" => ..., "signature" => ..., "signed_by" => ...,
      "ts" => ...}`. Persists via `Yawp.Channels.send_message/1`; on
      success broadcasts `new_message`; on signature failure replies
      `{:error, %{reason: "invalid_signature"}}`.

  Outbound (broadcast):
    * `new_message` — the serialised message payload (see `serialize/1`).
  """

  use Phoenix.Channel

  require Ash.Query

  alias Yawp.Identity.Identity, as: IdentityResource

  @impl true
  def join("channel:" <> channel_id, _params, socket) do
    identity = socket.assigns[:current_identity]

    with %IdentityResource{} <- identity,
         {:ok, %Yawp.Servers.Channel{server_id: server_id}} <- fetch_channel(channel_id),
         true <- has_membership?(identity.id, server_id) do
      send(self(), {:after_join, channel_id})
      {:ok, assign(socket, :channel_id, channel_id)}
    else
      _ -> {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info({:after_join, channel_id}, socket) do
    {:ok, messages} = Yawp.Channels.list_recent_messages(channel_id, authorize?: false)
    push(socket, "history", %{messages: Enum.map(messages, &serialize/1)})
    {:noreply, socket}
  end

  @impl true
  def handle_in("send", payload, socket) do
    identity = socket.assigns[:current_identity]
    channel_id = socket.assigns[:channel_id]

    body = Map.get(payload, "body")
    signature = Map.get(payload, "signature")
    signed_by = Map.get(payload, "signed_by")
    ts = Map.get(payload, "ts")

    cond do
      not is_binary(body) or byte_size(body) == 0 ->
        {:reply, {:error, %{reason: "invalid_body"}}, socket}

      not is_binary(signature) ->
        {:reply, {:error, %{reason: "invalid_signature"}}, socket}

      not is_binary(signed_by) ->
        {:reply, {:error, %{reason: "invalid_signature"}}, socket}

      not is_integer(ts) ->
        {:reply, {:error, %{reason: "invalid_payload"}}, socket}

      true ->
        case Yawp.Channels.send_message(
               %{
                 channel_id: channel_id,
                 author_identity_id: identity.id,
                 body: body,
                 signed_by: signed_by,
                 signature: signature,
                 ts: ts
               },
               authorize?: false
             ) do
          {:ok, message} ->
            payload = serialize(message)
            broadcast!(socket, "new_message", payload)
            {:reply, {:ok, payload}, socket}

          {:error, _err} ->
            {:reply, {:error, %{reason: "invalid_signature"}}, socket}
        end
    end
  end

  defp fetch_channel(channel_id) do
    case Ash.get(Yawp.Servers.Channel, channel_id, authorize?: false) do
      {:ok, channel} -> {:ok, channel}
      _ -> :error
    end
  end

  defp has_membership?(identity_id, server_id) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.exists?(authorize?: false)
  end

  defp serialize(%Yawp.Channels.Message{} = m) do
    %{
      id: m.id,
      channel_id: m.channel_id,
      author_identity_id: m.author_identity_id,
      body: m.body,
      signed_by: m.signed_by,
      signature: Base.url_encode64(m.signature, padding: false),
      server_inserted_at: DateTime.to_iso8601(m.server_inserted_at)
    }
  end
end
