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
      description """
      Idempotently appends an envelope to a recipient's inbox. Assigns
      the next per-recipient `inbox_serial`. A repeat `envelope_id` is a
      no-op upsert that preserves the original row and serial.
      """

      accept [:recipient_did, :envelope_id, :conversation_id, :kind, :envelope]
      upsert? true
      upsert_identity :unique_envelope
      upsert_fields []

      change Yawp.Federation.InboxEntry.Changes.AssignInboxSerial
    end

    read :pull do
      description "Recent envelopes for a recipient after a cursor serial, oldest first, capped."

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

    attribute :recipient_did, :string do
      allow_nil? false
      public? true
      description "DID of the user this envelope is addressed to."
    end

    attribute :envelope_id, :string do
      allow_nil? false
      public? true
      description "Sender-chosen 128-bit random id; the inbox dedupe key."
    end

    attribute :conversation_id, :string do
      allow_nil? true
      public? true
      description "sha256(sorted_set(participant DIDs)); null for non-DM notifications."
    end

    attribute :kind, :string do
      allow_nil? false
      default "dm"
      public? true
      description "Envelope kind: \"dm\" or \"notification\"."
    end

    attribute :envelope, :map do
      allow_nil? false
      public? true
      description "The full signed inner envelope as received."
    end

    attribute :inbox_serial, :integer do
      allow_nil? false
      public? true
      description "Per-recipient monotonic insertion serial; the pull cursor."
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_envelope, [:recipient_did, :envelope_id]
  end

  @type t :: %__MODULE__{}
end
