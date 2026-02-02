defmodule Mook.Chat.RoomTest do
  use Mook.DataCase, async: false

  alias Mook.Chat.Room

  @creator_did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
  @other_did "5jKZxYAwbcQbeKHkVTYJYNqyZxGRH8X2t9MnoVfbsoXg"
  @third_did "9pAfg9eA1NV4mY9ts6T8jSsFnzCWeFKVE1aTLqM7vnek"

  describe "create/1" do
    test "creates a room with name + creator and auto-joins the creator to members" do
      assert {:ok, room} =
               Room
               |> Ash.Changeset.for_create(
                 :create,
                 %{name: "general", created_by_did: @creator_did},
                 authorize?: false
               )
               |> Ash.create()

      assert room.id
      assert room.name == "general"
      assert room.created_by_did == @creator_did
      assert room.members == [@creator_did]
      assert %DateTime{} = room.created_at
    end

    test "requires name" do
      assert {:error, %Ash.Error.Invalid{}} =
               Room
               |> Ash.Changeset.for_create(
                 :create,
                 %{created_by_did: @creator_did},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "requires created_by_did" do
      assert {:error, %Ash.Error.Invalid{}} =
               Room
               |> Ash.Changeset.for_create(:create, %{name: "general"}, authorize?: false)
               |> Ash.create()
    end
  end

  describe "join/2" do
    setup do
      {:ok, room} =
        Room
        |> Ash.Changeset.for_create(
          :create,
          %{name: "general", created_by_did: @creator_did},
          authorize?: false
        )
        |> Ash.create()

      %{room: room}
    end

    test "appends a new did to members", %{room: room} do
      assert {:ok, updated} =
               room
               |> Ash.Changeset.for_update(:join, %{did: @other_did}, authorize?: false)
               |> Ash.update()

      assert updated.members == [@creator_did, @other_did]
    end

    test "is idempotent — joining twice does not duplicate", %{room: room} do
      {:ok, once} =
        room
        |> Ash.Changeset.for_update(:join, %{did: @other_did}, authorize?: false)
        |> Ash.update()

      {:ok, twice} =
        once
        |> Ash.Changeset.for_update(:join, %{did: @other_did}, authorize?: false)
        |> Ash.update()

      assert twice.members == [@creator_did, @other_did]
    end

    test "preserves order across multiple joins", %{room: room} do
      {:ok, r1} =
        room
        |> Ash.Changeset.for_update(:join, %{did: @other_did}, authorize?: false)
        |> Ash.update()

      {:ok, r2} =
        r1
        |> Ash.Changeset.for_update(:join, %{did: @third_did}, authorize?: false)
        |> Ash.update()

      assert r2.members == [@creator_did, @other_did, @third_did]
    end
  end

  describe "leave/2" do
    setup do
      {:ok, room} =
        Room
        |> Ash.Changeset.for_create(
          :create,
          %{name: "general", created_by_did: @creator_did},
          authorize?: false
        )
        |> Ash.create()

      {:ok, room} =
        room
        |> Ash.Changeset.for_update(:join, %{did: @other_did}, authorize?: false)
        |> Ash.update()

      %{room: room}
    end

    test "removes the did from members", %{room: room} do
      assert {:ok, updated} =
               room
               |> Ash.Changeset.for_update(:leave, %{did: @other_did}, authorize?: false)
               |> Ash.update()

      assert updated.members == [@creator_did]
    end

    test "is a no-op when did is not a member", %{room: room} do
      assert {:ok, updated} =
               room
               |> Ash.Changeset.for_update(:leave, %{did: @third_did}, authorize?: false)
               |> Ash.update()

      assert updated.members == [@creator_did, @other_did]
    end
  end
end
