defmodule Mook.Chat.MessageTest do
  use Mook.DataCase, async: false

  import Ecto.Query, only: [from: 2]
  require Ash.Query

  alias Mook.Chat.Message
  alias Mook.Chat.Room

  @creator_did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
  @other_did "5jKZxYAwbcQbeKHkVTYJYNqyZxGRH8X2t9MnoVfbsoXg"

  defp create_room! do
    Room
    |> Ash.Changeset.for_create(
      :create,
      %{name: "general", created_by_did: @creator_did},
      authorize?: false
    )
    |> Ash.create!()
  end

  describe "create/1" do
    test "creates a message in a room with content + sender_did" do
      room = create_room!()

      assert {:ok, msg} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{room_id: room.id, sender_did: @creator_did, content: "hello"},
                 authorize?: false
               )
               |> Ash.create()

      assert msg.id
      assert msg.room_id == room.id
      assert msg.sender_did == @creator_did
      assert msg.content == "hello"
      assert msg.ciphertext_envelope == nil
      assert msg.home_server == nil
      assert %DateTime{} = msg.inserted_at
    end

    test "requires room_id" do
      assert {:error, %Ash.Error.Invalid{}} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{sender_did: @creator_did, content: "hi"},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "requires sender_did" do
      room = create_room!()

      assert {:error, %Ash.Error.Invalid{}} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{room_id: room.id, content: "hi"},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "requires content" do
      room = create_room!()

      assert {:error, %Ash.Error.Invalid{}} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{room_id: room.id, sender_did: @creator_did},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "ciphertext_envelope and home_server are nullable and accept values" do
      room = create_room!()

      assert {:ok, msg} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{
                   room_id: room.id,
                   sender_did: @other_did,
                   content: "encrypted",
                   ciphertext_envelope: %{"v" => 1, "ct" => "abc"},
                   home_server: "mook.example"
                 },
                 authorize?: false
               )
               |> Ash.create()

      assert msg.ciphertext_envelope == %{"v" => 1, "ct" => "abc"}
      assert msg.home_server == "mook.example"
    end
  end

  describe "foreign key constraint" do
    test "rejects a message whose room_id does not reference an existing room" do
      bogus_room_id = Ash.UUID.generate()

      assert {:error, %Ash.Error.Invalid{}} =
               Message
               |> Ash.Changeset.for_create(
                 :create,
                 %{room_id: bogus_room_id, sender_did: @creator_did, content: "hi"},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "deleting a room cascades and removes its messages (on_delete: :delete_all)" do
      room = create_room!()

      {:ok, _msg} =
        Message
        |> Ash.Changeset.for_create(
          :create,
          %{room_id: room.id, sender_did: @creator_did, content: "doomed"},
          authorize?: false
        )
        |> Ash.create()

                        Mook.Repo.delete_all(
        from(r in "rooms", where: r.id == type(^room.id, :binary_id))
      )

      assert Message
             |> Ash.Query.filter(room_id == ^room.id)
             |> Ash.read!(authorize?: false) == []
    end
  end

  describe "ordering" do
    test "messages are read back in insertion order (inserted_at ascending)" do
      room = create_room!()

      for content <- ~w(one two three four) do
        Message
        |> Ash.Changeset.for_create(
          :create,
          %{room_id: room.id, sender_did: @creator_did, content: content},
          authorize?: false
        )
        |> Ash.create!()

                        Process.sleep(2)
      end

      contents =
        Message
        |> Ash.Query.sort(:inserted_at)
        |> Ash.read!(authorize?: false)
        |> Enum.map(& &1.content)

      assert contents == ~w(one two three four)
    end
  end
end
