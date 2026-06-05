defmodule Yawp.Repo.Migrations.DeliveryStates do
  @moduledoc false

  use Ecto.Migration

  def up do
    alter table(:identities) do
      add_if_not_exists :read_receipts_enabled, :boolean, null: false, default: true
    end

    create_if_not_exists table(:federation_delivery_states, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :envelope_id, :text, null: false
      add :recipient_did, :text, null: false
      add :state, :text, null: false
      add :updated_at, :utc_datetime_usec, null: false
    end

    create_if_not_exists unique_index(:federation_delivery_states, [:envelope_id, :recipient_did],
                           name: "federation_delivery_states_unique_delivery_state_index"
                         )
  end

  def down do
    drop_if_exists unique_index(:federation_delivery_states, [:envelope_id, :recipient_did],
                     name: "federation_delivery_states_unique_delivery_state_index"
                   )

    drop table(:federation_delivery_states)

    alter table(:identities) do
      remove :read_receipts_enabled
    end
  end
end
