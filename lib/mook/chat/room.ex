defmodule Mook.Chat.Room do
  use Ash.Resource,
    otp_app: :mook,
    domain: Mook.Chat,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "rooms"
    repo Mook.Repo

    migration_types members: :jsonb
    migration_defaults members: "fragment(\"'[]'::jsonb\")"
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
      description "Append a DID to the room's members list (idempotent)."

      require_atomic? false
      accept []

      argument :did, :string, allow_nil?: false

      change fn changeset, _ctx ->
        did = Ash.Changeset.get_argument(changeset, :did)
        members = Ash.Changeset.get_attribute(changeset, :members) || []

        if did in members do
          changeset
        else
          Ash.Changeset.force_change_attribute(changeset, :members, members ++ [did])
        end
      end
    end

    update :leave do
      description "Remove a DID from the room's members list (no-op if absent)."

      require_atomic? false
      accept []

      argument :did, :string, allow_nil?: false

      change fn changeset, _ctx ->
        did = Ash.Changeset.get_argument(changeset, :did)
        members = Ash.Changeset.get_attribute(changeset, :members) || []
        Ash.Changeset.force_change_attribute(changeset, :members, members -- [did])
      end
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
end
