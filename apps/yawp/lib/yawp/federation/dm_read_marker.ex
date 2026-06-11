defmodule Yawp.Federation.DmReadMarker do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Federation,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "federation_dm_read_markers"
    repo Yawp.Repo

    references do
      reference :identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :upsert do
      primary? true
      accept [:identity_id, :conversation_id, :last_read_envelope_id, :updated_at]
      upsert? true
      upsert_identity :unique_identity_conversation
      upsert_fields [:last_read_envelope_id, :updated_at]
      change set_attribute(:updated_at, &DateTime.utc_now/0)
    end

    read :get_for_identity_conversation do
      get? true
      argument :identity_id, :uuid, allow_nil?: false
      argument :conversation_id, :string, allow_nil?: false
      filter expr(identity_id == ^arg(:identity_id) and conversation_id == ^arg(:conversation_id))
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :conversation_id, :string do
      allow_nil? false
      public? true
    end

    attribute :last_read_envelope_id, :string do
      allow_nil? false
      public? true
    end

    attribute :updated_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end
  end

  relationships do
    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  identities do
    identity :unique_identity_conversation, [:identity_id, :conversation_id]
  end

  @type t :: %__MODULE__{}
end
