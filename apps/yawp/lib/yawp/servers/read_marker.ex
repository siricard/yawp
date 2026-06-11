defmodule Yawp.Servers.ReadMarker do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_read_markers"
    repo Yawp.Repo

    references do
      reference :identity, on_delete: :delete
      reference :channel, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :upsert do
      primary? true
      accept [:identity_id, :channel_id, :last_read_message_id, :signed_by, :updated_at]
      argument :identity_did, :string, allow_nil?: false
      argument :sender_signature, :string, allow_nil?: false
      argument :ts, :integer, allow_nil?: false
      upsert? true
      upsert_identity :unique_identity_channel
      upsert_fields [:last_read_message_id, :signed_by, :signature, :updated_at]
      change Yawp.Servers.ReadMarker.Changes.VerifySignature
      change set_attribute(:updated_at, &DateTime.utc_now/0)
    end

    read :get_for_identity_channel do
      get? true
      argument :identity_id, :uuid, allow_nil?: false
      argument :channel_id, :uuid, allow_nil?: false
      filter expr(identity_id == ^arg(:identity_id) and channel_id == ^arg(:channel_id))
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :last_read_message_id, :string do
      allow_nil? false
      public? true
    end

    attribute :signed_by, :string do
      allow_nil? false
      public? true
    end

    attribute :signature, :binary do
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

    belongs_to :channel, Yawp.Servers.Channel do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  identities do
    identity :unique_identity_channel, [:identity_id, :channel_id]
  end

  @type t :: %__MODULE__{}
end
