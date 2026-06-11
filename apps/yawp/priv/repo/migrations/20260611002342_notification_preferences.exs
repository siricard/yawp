defmodule Yawp.Repo.Migrations.NotificationPreferences do
  @moduledoc false

  use Ecto.Migration

  def up do
    create table(:identity_notification_preferences, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :server_id, :uuid
      add :channel_id, :uuid
      add :conversation_id, :text
      add :level, :text, null: false

      add :inserted_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :updated_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :identity_id,
          references(:identities,
            column: :id,
            name: "identity_notification_preferences_identity_id_fkey",
            type: :uuid,
            prefix: "public"
          ),
          null: false
    end

    create unique_index(
             :identity_notification_preferences,
             [:identity_id, :server_id, :channel_id, :conversation_id],
             name: "identity_notification_preferences_unique_scope_index",
             nulls_distinct: false
           )

    create table(:identity_device_push_registries, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :device_subkey_id, :uuid, null: false
      add :platform, :text, null: false
      add :token, :text, null: false

      add :inserted_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :updated_at, :utc_datetime_usec, null: false

      add :identity_id,
          references(:identities,
            column: :id,
            name: "identity_device_push_registries_identity_id_fkey",
            type: :uuid,
            prefix: "public"
          ),
          null: false
    end

    create unique_index(
             :identity_device_push_registries,
             [:identity_id, :device_subkey_id, :platform],
             name: "identity_device_push_registries_unique_device_platform_index"
           )
  end

  def down do
    drop constraint(
           :identity_device_push_registries,
           "identity_device_push_registries_identity_id_fkey"
         )

    drop_if_exists unique_index(
                     :identity_device_push_registries,
                     [:identity_id, :device_subkey_id, :platform],
                     name: "identity_device_push_registries_unique_device_platform_index"
                   )

    drop table(:identity_device_push_registries)

    drop constraint(
           :identity_notification_preferences,
           "identity_notification_preferences_identity_id_fkey"
         )

    drop_if_exists unique_index(
                     :identity_notification_preferences,
                     [:identity_id, :server_id, :channel_id, :conversation_id],
                     name: "identity_notification_preferences_unique_scope_index"
                   )

    drop table(:identity_notification_preferences)
  end
end
