defmodule Yawp.Identity.NotificationPreference do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "identity_notification_preferences"
    repo Yawp.Repo
  end

  typescript do
    type_name "NotificationPreference"
  end

  actions do
    defaults [:read]

    create :upsert do
      primary? true
      accept [:server_id, :channel_id, :conversation_id, :level]
      argument :identity_id, :uuid, allow_nil?: true
      argument :identity_did, :string, allow_nil?: true
      change Yawp.Identity.NotificationPreference.Changes.ResolveIdentity
      change Yawp.Identity.NotificationPreference.Changes.AuthorizeOwner
      upsert? true
      upsert_identity :unique_scope
    end

    read :for_identity do
      argument :identity_id, :uuid, allow_nil?: false
      filter expr(identity_id == ^arg(:identity_id))
    end
  end

  validations do
    validate Yawp.Identity.NotificationPreference.Validations.ScopeShape
  end

  attributes do
    uuid_primary_key :id

    attribute :server_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :channel_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :conversation_id, :string do
      allow_nil? true
      public? true
    end

    attribute :level, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:all, :mentions_only, :muted]
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  relationships do
    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  identities do
    identity :unique_scope, [:identity_id, :server_id, :channel_id, :conversation_id]
  end
end
