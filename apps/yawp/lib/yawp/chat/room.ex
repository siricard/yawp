defmodule Yawp.Chat.Room do
  @moduledoc """
  A chat room: a named container with a `members` list of DIDs.

  ## Membership concurrency

  `:join` and `:leave` mutate `members` (a `{:array, :string}` stored as
  jsonb). Without serialization, two concurrent joins on the same room
  both read the pre-state, each append their own DID, and the second
  UPDATE clobbers the first.

  We close that race by:

    * running both actions in a transaction (`transaction? true`), and
    * issuing `SELECT ... FOR UPDATE` on the target row inside a
      `before_action` hook so concurrent transactions serialize on the
      Postgres row lock.

  This intentionally keeps the jsonb `members` column rather than
  promoting it to a join table rooms are small, the access
  pattern is bounded, and the cost of the lock is dominated by the
  channel broadcast that follows. See `docs/`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Chat,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  require Ash.Query

  postgres do
    table "rooms"
    repo Yawp.Repo

    migration_types members: :jsonb
    migration_defaults members: "fragment(\"'[]'::jsonb\")"
  end

  typescript do
    type_name "Room"
  end

  actions do
    defaults [:read]

    create :create do
      description """
      Creates a new chat room. The creating DID is recorded in
      `created_by_did` and is auto-added to `members` so the creator does
      not need to issue a separate `join` action.
      """

      accept [:name, :created_by_did]

      change fn changeset, _ctx ->
        case Ash.Changeset.get_attribute(changeset, :created_by_did) do
          did when is_binary(did) and did != "" ->
            Ash.Changeset.force_change_attribute(changeset, :members, [did])

          _ ->
            changeset
        end
      end
    end

    update :join do
      description "Append a DID to the room's members list (idempotent, concurrency-safe)."

      require_atomic? false
      transaction? true
      accept []

      argument :did, :string, allow_nil?: false

                                    change before_action(&Yawp.Chat.Room.lock_and_join/2)
    end

    update :leave do
      description "Remove a DID from the room's members list (no-op if absent, concurrency-safe)."

      require_atomic? false
      transaction? true
      accept []

      argument :did, :string, allow_nil?: false

            change before_action(&Yawp.Chat.Room.lock_and_leave/2)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :members, {:array, :string} do
      allow_nil? false
      default []
      public? true
      description "Ordered list of DIDs that are members of this room."
    end

    attribute :created_by_did, :string do
      allow_nil? false
      public? true
      description "DID of the user who created the room."
    end

    create_timestamp :created_at
  end

                    
  @doc false
  def lock_and_join(changeset, _context) do
    did = Ash.Changeset.get_argument(changeset, :did)

    {:ok, locked} =
      __MODULE__
      |> Ash.Query.filter(id == ^changeset.data.id)
      |> Ash.Query.lock(:for_update)
      |> Ash.read_one(authorize?: false)

    members = locked.members || []

    new_members =
      if did in members do
        members
      else
        members ++ [did]
      end

    changeset
    |> Ash.Changeset.force_change_attribute(:members, new_members)
    |> reset_data_for_lock(locked)
  end

  @doc false
  def lock_and_leave(changeset, _context) do
    did = Ash.Changeset.get_argument(changeset, :did)

    {:ok, locked} =
      __MODULE__
      |> Ash.Query.filter(id == ^changeset.data.id)
      |> Ash.Query.lock(:for_update)
      |> Ash.read_one(authorize?: false)

    members = locked.members || []
    new_members = members -- [did]

    changeset
    |> Ash.Changeset.force_change_attribute(:members, new_members)
    |> reset_data_for_lock(locked)
  end

          defp reset_data_for_lock(changeset, locked) do
    %{changeset | data: locked}
  end
end
