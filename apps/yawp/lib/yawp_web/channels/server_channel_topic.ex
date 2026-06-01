defmodule YawpWeb.ServerChannelTopic do
  @moduledoc """
  Phoenix channel for one server text channel (ADR 017 / ADR 019).

  Topic: `server:<server_id>:channel:<channel_id>` where both segments
  are UUIDs of a `Yawp.Servers.Server` and a `Yawp.Servers.Channel` that
  belongs to it.

  On join the connecting identity must hold the `read_messages` bit for
  the channel, resolved through `Yawp.Servers.Permissions.effective_bits/3`
  (owners short-circuit to all bits; banned/kicked members resolve to 0).
  A successful join pushes the channel history and the current presence
  roster, then tracks the joiner.

  Inbound events (all signature-verified through the message store):

    * `send_message` — needs `send_messages`. Persists via
      `Yawp.Servers.send_server_message/1`; broadcasts `new_message`.
    * `edit_message` — needs `send_messages`; the message store rejects
      edits not signed by the original author. Broadcasts `message_edited`.
    * `delete_message` — own message, or `manage_messages` for someone
      else's. Persists a tombstone; broadcasts `message_deleted`.

  Outbound events: `new_message`, `message_edited`, `message_deleted`.
  """

  use Phoenix.Channel

  alias Yawp.Identity.Identity, as: IdentityResource
  alias Yawp.Servers
  alias Yawp.Servers.Permissions
  alias YawpWeb.Presence

  @impl true
  def join("server:" <> rest, _params, socket) do
    identity = socket.assigns[:current_identity]

    with {:ok, server_id, channel_id} <- parse_topic(rest),
         %IdentityResource{} <- identity,
         {:ok, server} <- fetch(Servers.Server, server_id),
         {:ok, channel} <- fetch_channel(channel_id, server_id),
         bits <- Permissions.effective_bits(identity, server, channel),
         true <- Permissions.has?(bits, :read_messages) do
      send(self(), :after_join)

      {:ok,
       socket
       |> assign(:server, server)
       |> assign(:channel, channel)
       |> assign(:effective_bits, bits)}
    else
      :bad_topic -> {:error, %{reason: "bad_topic"}}
      _ -> {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    channel = socket.assigns.channel

    {:ok, messages} = Servers.list_channel_messages(channel.id, authorize?: false)
    push(socket, "history", %{messages: Enum.map(messages, &serialize_message/1)})

    {:ok, _} =
      Presence.track(socket, bare_did(socket.assigns.current_identity.did), %{
        online_at: System.system_time(:second)
      })

    push(socket, "presence_state", Presence.list(socket))
    {:noreply, socket}
  end

  @impl true
  def handle_in("send_message", payload, socket) do
    identity = socket.assigns.current_identity
    channel = socket.assigns.channel

    cond do
      not Permissions.has?(socket.assigns.effective_bits, :send_messages) ->
        {:reply, {:error, %{reason: "unauthorized"}}, socket}

      not valid_send_payload?(payload) ->
        {:reply, {:error, %{reason: "invalid_payload"}}, socket}

      true ->
        attrs = %{
          channel_id: channel.id,
          sender_did: identity.did,
          body: Map.fetch!(payload, "body"),
          reply_to_message_id: Map.get(payload, "reply_to_message_id"),
          mentions: Map.get(payload, "mentions", []),
          attachments: Map.get(payload, "attachments", []),
          signed_by: Map.fetch!(payload, "signed_by"),
          signature: Map.fetch!(payload, "signature"),
          ts: Map.fetch!(payload, "ts")
        }

        case Servers.send_server_message(attrs) do
          {:ok, message} ->
            serialized = serialize_message(message)
            broadcast!(socket, "new_message", serialized)
            {:reply, {:ok, serialized}, socket}

          {:error, _} ->
            {:reply, {:error, %{reason: "invalid_signature"}}, socket}
        end
    end
  end

  @impl true
  def handle_in("edit_message", payload, socket) do
    cond do
      not Permissions.has?(socket.assigns.effective_bits, :send_messages) ->
        {:reply, {:error, %{reason: "unauthorized"}}, socket}

      not valid_edit_payload?(payload) ->
        {:reply, {:error, %{reason: "invalid_payload"}}, socket}

      true ->
        attrs = %{
          message_id: Map.fetch!(payload, "message_id"),
          body: Map.fetch!(payload, "body"),
          signed_by: Map.fetch!(payload, "signed_by"),
          signature: Map.fetch!(payload, "signature"),
          ts: Map.fetch!(payload, "ts")
        }

        case Servers.edit_server_message(attrs) do
          {:ok, edit} ->
            serialized = serialize_edit(edit)
            broadcast!(socket, "message_edited", serialized)
            {:reply, {:ok, serialized}, socket}

          {:error, _} ->
            {:reply, {:error, %{reason: "invalid_signature"}}, socket}
        end
    end
  end

  @impl true
  def handle_in("delete_message", payload, socket) do
    if valid_delete_payload?(payload) do
      attrs = %{
        message_id: Map.fetch!(payload, "message_id"),
        reason: Map.fetch!(payload, "reason"),
        actor_did: socket.assigns.current_identity.did,
        signed_by: Map.fetch!(payload, "signed_by"),
        signature: Map.fetch!(payload, "signature"),
        ts: Map.fetch!(payload, "ts")
      }

      case Servers.delete_server_message(attrs) do
        {:ok, tombstone} ->
          serialized = serialize_tombstone(tombstone)
          broadcast!(socket, "message_deleted", serialized)
          {:reply, {:ok, serialized}, socket}

        {:error, _} ->
          {:reply, {:error, %{reason: "unauthorized"}}, socket}
      end
    else
      {:reply, {:error, %{reason: "invalid_payload"}}, socket}
    end
  end

  defp parse_topic(rest) do
    case String.split(rest, ":channel:") do
      [server_id, channel_id]
      when byte_size(server_id) > 0 and byte_size(channel_id) > 0 ->
        {:ok, server_id, channel_id}

      _ ->
        :bad_topic
    end
  end

  defp fetch(resource, id) do
    case Ash.get(resource, id, authorize?: false) do
      {:ok, record} -> {:ok, record}
      _ -> :error
    end
  end

  defp fetch_channel(channel_id, server_id) do
    case Ash.get(Servers.Channel, channel_id, authorize?: false) do
      {:ok, %Servers.Channel{server_id: ^server_id} = channel} -> {:ok, channel}
      _ -> :error
    end
  end

  defp valid_send_payload?(%{"body" => body, "signature" => sig, "signed_by" => sb, "ts" => ts}) do
    is_binary(body) and byte_size(body) > 0 and is_binary(sig) and is_binary(sb) and
      is_integer(ts)
  end

  defp valid_send_payload?(_), do: false

  defp valid_edit_payload?(%{
         "message_id" => mid,
         "body" => body,
         "signature" => sig,
         "signed_by" => sb,
         "ts" => ts
       }) do
    is_binary(mid) and is_binary(body) and byte_size(body) > 0 and is_binary(sig) and
      is_binary(sb) and is_integer(ts)
  end

  defp valid_edit_payload?(_), do: false

  defp valid_delete_payload?(%{
         "message_id" => mid,
         "reason" => reason,
         "signature" => sig,
         "signed_by" => sb,
         "ts" => ts
       }) do
    is_binary(mid) and reason in ["sender", "moderator"] and is_binary(sig) and is_binary(sb) and
      is_integer(ts)
  end

  defp valid_delete_payload?(_), do: false

  defp serialize_message(%Servers.Message{} = m) do
    %{
      id: m.id,
      channel_id: m.channel_id,
      sender_did: bare_did(m.sender_did),
      body: m.body,
      reply_to_message_id: m.reply_to_message_id,
      mentions: m.mentions,
      attachments: m.attachments,
      signed_by: m.signed_by,
      signature: Base.url_encode64(m.sender_signature, padding: false),
      server_serial: m.server_serial,
      server_inserted_at: DateTime.to_iso8601(m.server_inserted_at)
    }
  end

  defp serialize_edit(%Servers.MessageEdit{} = e) do
    %{
      message_id: e.message_id,
      body: e.body,
      edit_serial: e.edit_serial,
      signed_by: e.signed_by,
      signature: Base.url_encode64(e.sender_signature, padding: false),
      inserted_at: DateTime.to_iso8601(e.inserted_at)
    }
  end

  defp serialize_tombstone(%Servers.MessageTombstone{} = t) do
    %{
      message_id: t.message_id,
      reason: to_string(t.reason),
      actor_did: bare_did(t.actor_did),
      inserted_at: DateTime.to_iso8601(t.inserted_at)
    }
  end

  defp bare_did("did:yawp:" <> base58), do: base58
  defp bare_did(other) when is_binary(other), do: other
end
