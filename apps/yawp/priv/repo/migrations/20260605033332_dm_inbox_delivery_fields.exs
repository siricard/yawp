defmodule Yawp.Repo.Migrations.DmInboxDeliveryFields do
  use Ecto.Migration

  def up do
    alter table(:federation_inbox_entries) do
      add :identity_id, :text
      add :ciphertext_envelope, :map
      add :wrapper_signature, :text
      add :received_at, :utc_datetime_usec
    end

    execute "UPDATE federation_inbox_entries SET identity_id = recipient_did WHERE identity_id IS NULL"

    execute "UPDATE federation_inbox_entries SET ciphertext_envelope = envelope WHERE ciphertext_envelope IS NULL"

    execute """
    UPDATE federation_inbox_entries
    SET received_at = inserted_at
    WHERE received_at IS NULL
    """

    alter table(:federation_inbox_entries) do
      modify :identity_id, :text, null: false
      modify :ciphertext_envelope, :map, null: false
      modify :received_at, :utc_datetime_usec, null: false
    end

    drop_if_exists unique_index(:federation_inbox_entries, [:recipient_did, :envelope_id],
                     name: "federation_inbox_entries_unique_envelope_index"
                   )

    create unique_index(:federation_inbox_entries, [:identity_id, :envelope_id],
             name: "federation_inbox_entries_unique_envelope_index"
           )
  end

  def down do
    drop_if_exists unique_index(:federation_inbox_entries, [:identity_id, :envelope_id],
                     name: "federation_inbox_entries_unique_envelope_index"
                   )

    create unique_index(:federation_inbox_entries, [:recipient_did, :envelope_id],
             name: "federation_inbox_entries_unique_envelope_index"
           )

    alter table(:federation_inbox_entries) do
      remove :received_at
      remove :wrapper_signature
      remove :ciphertext_envelope
      remove :identity_id
    end
  end
end
