defmodule Yawp.Identity.DevicePushRegistry do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "identity_device_push_registries"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :upsert do
      primary? true
      accept [:identity_id, :device_subkey_id, :platform, :token]
      change set_attribute(:updated_at, &DateTime.utc_now/0)
      upsert? true
      upsert_identity :unique_device_platform
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :device_subkey_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :platform, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:apns, :fcm]
    end

    attribute :token, :string do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at

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
    identity :unique_device_platform, [:identity_id, :device_subkey_id, :platform]
  end
end
