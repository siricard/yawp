defmodule MookWeb.RoomChannelTest do
  @moduledoc """
  Covers `MookWeb.RoomChannel` (topic `room:<room_id>`):

    * Unauthenticated socket (no `current_did` assigned) → `:unauthorized`.
    * Authenticated socket whose DID is NOT in `room.members` →
      `:not_a_member`.
    * Authenticated member → join succeeds.
    * Two-client broadcast: A sends `send_message`; B (also a member)
      receives `new_message` on its subscribed socket.
  """

  use MookWeb.ChannelCase, async: false

  alias Mook.Chat.Message
  alias Mook.Chat.Room
  alias MookWeb.RoomChannel
  alias MookWeb.UserSocket

  @did_a "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
  @did_b "5jKZxYAwbcQbeKHkVTYJYNqyZxGRH8X2t9MnoVfbsoXg"
  @did_c "9pAfg9eA1NV4mY9ts6T8jSsFnzCWeFKVE1aTLqM7vnek"

  defp create_room!(creator_did) do
    Room
    |> Ash.Changeset.for_create(
      :create,
      %{name: "general", created_by_did: creator_did},
      authorize?: false
    )
    |> Ash.create!()
  end

  defp join_as(did, room_id) do
    socket = socket(UserSocket, nil, %{current_did: did})
    subscribe_and_join(socket, RoomChannel, "room:#{room_id}", %{})
  end

  describe "join/3" do
    test "rejects join when socket has no current_did → :unauthorized" do
      room = create_room!(@did_a)

      socket = socket(UserSocket, nil, %{})

      assert {:error, %{reason: :unauthorized}} =
               subscribe_and_join(socket, RoomChannel, "room:#{room.id}", %{})
    end

    test "rejects join when current_did is not in room.members → :not_a_member" do
      room = create_room!(@did_a)

      assert {:error, %{reason: :not_a_member}} = join_as(@did_c, room.id)
    end

    test "accepts join for a member of the room" do
      room = create_room!(@did_a)

      assert {:ok, _reply, socket} = join_as(@did_a, room.id)
      assert socket.assigns.current_did == @did_a
      assert socket.assigns.room_id == room.id
    end

    test "returns :room_not_found for a nonexistent room id" do
      missing_id = "00000000-0000-0000-0000-000000000000"

      socket = socket(UserSocket, nil, %{current_did: @did_a})

      assert {:error, %{reason: :room_not_found}} =
               subscribe_and_join(socket, RoomChannel, "room:#{missing_id}", %{})
    end
  end

  describe "send_message" do
    setup do
      room = create_room!(@did_a)

      {:ok, room} =
        room
        |> Ash.Changeset.for_update(:join, %{did: @did_b}, authorize?: false)
        |> Ash.update()

      %{room: room}
    end

    test "persists a Message and broadcasts new_message to subscribers", %{room: room} do
      {:ok, _reply, socket_a} = join_as(@did_a, room.id)

      ref = push(socket_a, "send_message", %{"content" => "hello world"})
      assert_reply ref, :ok, %{id: msg_id}
      assert is_binary(msg_id)

                  assert_broadcast "new_message", %{
        sender_did: @did_a,
        content: "hello world",
        room_id: room_id_received
      }

      assert room_id_received == room.id

            assert [%Message{} = msg] = Ash.read!(Message, authorize?: false)
      assert msg.content == "hello world"
      assert msg.sender_did == @did_a
      assert msg.room_id == room.id
    end

    test "two-client broadcast: A sends, B receives new_message", %{room: room} do
      {:ok, _reply, socket_a} = join_as(@did_a, room.id)
      {:ok, _reply, _socket_b} = join_as(@did_b, room.id)

      ref = push(socket_a, "send_message", %{"content" => "ping"})
      assert_reply ref, :ok, _

                        assert_broadcast "new_message", %{sender_did: @did_a, content: "ping"}
    end

    test "rejects empty content with :invalid_content", %{room: room} do
      {:ok, _reply, socket_a} = join_as(@did_a, room.id)

      ref = push(socket_a, "send_message", %{"content" => ""})
      assert_reply ref, :error, %{reason: :invalid_content}
    end

    test "rejects missing content field with :invalid_payload", %{room: room} do
      {:ok, _reply, socket_a} = join_as(@did_a, room.id)

      ref = push(socket_a, "send_message", %{})
      assert_reply ref, :error, %{reason: :invalid_payload}
    end
  end
end
