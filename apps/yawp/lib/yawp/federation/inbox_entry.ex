defmodule Yawp.Federation.InboxEntry do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Federation,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "federation_inbox_entries"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :append do
      accept [
        :identity_id,
        :recipient_did,
        :envelope_id,
        :conversation_id,
        :kind,
        :ciphertext_envelope,
        :envelope,
        :wrapper_signature,
        :received_at
      ]

      upsert? true
      upsert_identity :unique_envelope
      upsert_fields []

      change Yawp.Federation.InboxEntry.Changes.AssignInboxSerial
    end

    read :pull do
      argument :recipient_did, :string, allow_nil?: false
      argument :since_serial, :integer, allow_nil?: false, default: 0
      argument :limit, :integer, allow_nil?: false, default: 1000

      filter expr(recipient_did == ^arg(:recipient_did) and inbox_serial > ^arg(:since_serial))
      prepare build(sort: [inbox_serial: :asc])
      prepare Yawp.Federation.InboxEntry.Preparations.CapLimit
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :identity_id, :string do
      allow_nil? false
      public? true
    end

    attribute :recipient_did, :string do
      allow_nil? false
      public? true
    end

    attribute :envelope_id, :string do
      allow_nil? false
      public? true
    end

    attribute :conversation_id, :string do
      allow_nil? true
      public? true
    end

    attribute :kind, :string do
      allow_nil? false
      default "dm"
      public? true
    end

    attribute :ciphertext_envelope, :map do
      allow_nil? false
      public? true
    end

    attribute :envelope, :map do
      allow_nil? false
      public? true
    end

    attribute :wrapper_signature, :string do
      allow_nil? true
      public? true
    end

    attribute :inbox_serial, :integer do
      allow_nil? false
      public? true
    end

    attribute :received_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_envelope, [:identity_id, :envelope_id]
  end

  @type t :: %__MODULE__{}
end
