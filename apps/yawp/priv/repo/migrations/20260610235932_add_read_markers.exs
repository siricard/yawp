defmodule Yawp.Repo.Migrations.AddReadMarkers do
  @moduledoc false

  use Ecto.Migration

  def up do
    create table(:server_read_markers, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :last_read_message_id, :text, null: false
      add :updated_at, :utc_datetime_usec, null: false

      add :identity_id,
          references(:identities,
            column: :id,
            name: "server_read_markers_identity_id_fkey",
            type: :uuid,
            prefix: "public",
            on_delete: :delete_all
          ),
          null: false

      add :channel_id,
          references(:server_channels,
            column: :id,
            name: "server_read_markers_channel_id_fkey",
            type: :uuid,
            prefix: "public",
            on_delete: :delete_all
          ),
          null: false
    end

    create unique_index(:server_read_markers, [:identity_id, :channel_id],
             name: "server_read_markers_unique_identity_channel_index"
           )

    create table(:federation_dm_read_markers, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :conversation_id, :text, null: false
      add :last_read_envelope_id, :text, null: false
      add :updated_at, :utc_datetime_usec, null: false

      add :identity_id,
          references(:identities,
            column: :id,
            name: "federation_dm_read_markers_identity_id_fkey",
            type: :uuid,
            prefix: "public",
            on_delete: :delete_all
          ),
          null: false
    end

    create unique_index(:federation_dm_read_markers, [:identity_id, :conversation_id],
             name: "federation_dm_read_markers_unique_identity_conversation_index"
           )
  end

  def down do
    drop constraint(:federation_dm_read_markers, "federation_dm_read_markers_identity_id_fkey")

    drop_if_exists unique_index(:federation_dm_read_markers, [:identity_id, :conversation_id],
                     name: "federation_dm_read_markers_unique_identity_conversation_index"
                   )

    drop table(:federation_dm_read_markers)

    drop constraint(:server_read_markers, "server_read_markers_identity_id_fkey")

    drop constraint(:server_read_markers, "server_read_markers_channel_id_fkey")

    drop_if_exists unique_index(:server_read_markers, [:identity_id, :channel_id],
                     name: "server_read_markers_unique_identity_channel_index"
                   )

    drop table(:server_read_markers)
  end
end
