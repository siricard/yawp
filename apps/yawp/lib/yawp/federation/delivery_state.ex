defmodule Yawp.Federation.DeliveryState do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Federation,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "federation_delivery_states"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :upsert do
      accept [:envelope_id, :recipient_did, :state, :updated_at]
      upsert? true
      upsert_identity :unique_delivery_state
      upsert_fields [:state, :updated_at]
    end

    read :for_envelope do
      argument :envelope_id, :string, allow_nil?: false
      filter expr(envelope_id == ^arg(:envelope_id))
    end

    read :for_conversation do
      argument :envelope_ids, {:array, :string}, allow_nil?: false
      filter expr(envelope_id in ^arg(:envelope_ids))
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :envelope_id, :string do
      allow_nil? false
      public? true
    end

    attribute :recipient_did, :string do
      allow_nil? false
      public? true
    end

    attribute :state, :atom do
      allow_nil? false
      constraints one_of: [:sent, :delivered, :read]
      public? true
    end

    attribute :updated_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end
  end

  identities do
    identity :unique_delivery_state, [:envelope_id, :recipient_did]
  end
end
