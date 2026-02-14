defmodule YawpWeb.RoomChannel do
  @moduledoc """
  Phoenix channel for chat rooms — topic `room:<room_id>`.

  ## Authorization (M4)

  Join requires two things, in order:

    1. `socket.assigns.current_did` is set. This assign is established at
       the SOCKET level by `YawpWeb.UserSocket.connect/3` when the client
       presents a valid Phoenix.Token (`?token=<phx_token>` on connect)
       obtained from the `auth:lobby` handshake. If `current_did` is
       absent (anonymous connect), the join is refused with
       `{:error, %{reason: :unauthorized}}`.

    2. That DID is in the room's `members` jsonb list. Otherwise join is
       refused with `{:error, %{reason: :not_a_member}}`.

  A nonexistent `room_id` yields `{:error, %{reason: :room_not_found}}`.

  ## Events

  | Direction | Event | Payload | Reply / Broadcast |
  |-----------|-------|---------|-------------------|
  | in | `send_message` | `{"content": string}` | `{:reply, {:ok, %{id}}}` + broadcast `new_message` on the topic |

  The `new_message` broadcast payload is
  `%{id, room_id, sender_did, content, inserted_at}` — same shape used by
  the web and RN clients.

  The `sender_did` on a created message is always
  `socket.assigns.current_did`; the client cannot forge another DID.
  """

  use YawpWeb, :channel

  alias Yawp.Chat.Message
  alias Yawp.Chat.Room

  @impl true
  def join("room:" <> room_id, _params, socket) do
    cond do
      not Map.has_key?(socket.assigns, :current_did) ->
        {:error, %{reason: :unauthorized}}

      true ->
        case Ash.get(Room, room_id, authorize?: false) do
          {:ok, room} ->
            if socket.assigns.current_did in (room.members || []) do
              {:ok, %{room_id: room.id}, assign(socket, :room_id, room.id)}
            else
              {:error, %{reason: :not_a_member}}
            end

          {:error, _} ->
            {:error, %{reason: :room_not_found}}
        end
    end
  end

  @impl true
  def handle_in("send_message", payload, socket) do
    case payload do
      %{"content" => content} when is_binary(content) ->
        case String.trim(content) do
          "" ->
            {:reply, {:error, %{reason: :invalid_content}}, socket}

          _ ->
            do_send(content, socket)
        end

      _ ->
        {:reply, {:error, %{reason: :invalid_payload}}, socket}
    end
  end

  defp do_send(content, socket) do
    %{room_id: room_id, current_did: did} = socket.assigns

    attrs = %{room_id: room_id, sender_did: did, content: content}

    case Message
         |> Ash.Changeset.for_create(:create, attrs, authorize?: false)
         |> Ash.create() do
      {:ok, msg} ->
        broadcast!(socket, "new_message", %{
          id: msg.id,
          room_id: msg.room_id,
          sender_did: msg.sender_did,
          content: msg.content,
          inserted_at: msg.inserted_at
        })

        {:reply, {:ok, %{id: msg.id}}, socket}

      {:error, _} ->
        {:reply, {:error, %{reason: :invalid_payload}}, socket}
    end
  end
end
