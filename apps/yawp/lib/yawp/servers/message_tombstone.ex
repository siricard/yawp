defmodule Yawp.Servers.MessageTombstone do
  @moduledoc """
  A signed delete event for a `Yawp.Servers.Message` (ADR 019).

  A tombstone wipes the message `body` while preserving its timeline
  slot (the `server_serial` is untouched), and records who deleted it and
  why. `reason` is one of:

    * `:sender` — the original author deleted their own message.
    * `:moderator` — a role holding `manage_messages` deleted it.
    * `:retention` — produced by the retention sweep, signed by the
      server keypair.

  The `:create` action verifies the actor's device-subkey signature over
  the canonical-JSON envelope, authorises the delete (sender deletes own;
  moderator needs `manage_messages`), and — when the server's
  `body_archive_enabled` flag is on — archives the original body to the
  admin-only `Yawp.Servers.ArchivedMessageBody` store before wiping it.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_message_tombstones"
    repo Yawp.Repo

    references do
      reference :message, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :create do
      description """
      Persists a signed tombstone, then archives (if enabled) and wipes
      the message body.

      Signature contract: `signature` is base64url(64 bytes) ed25519
      over the RFC 8785 canonical-JSON encoding of
      `{message_id, reason, actor_did, ts}` where `ts` is a millisecond
      epoch integer, produced by the `signed_by` device subkey.
      """

      primary? true
      accept [:message_id, :reason, :actor_did, :signed_by]

      argument :signature, :string, allow_nil?: false
      argument :ts, :integer, allow_nil?: false

      change Yawp.Servers.MessageTombstone.Changes.VerifyDeleteSignature
      change Yawp.Servers.MessageTombstone.Changes.AuthorizeDelete
      change Yawp.Servers.MessageTombstone.Changes.ArchiveAndWipeBody
    end

    read :list_for_message do
      description "Tombstones for a message."
      argument :message_id, :uuid, allow_nil?: false

      filter expr(message_id == ^arg(:message_id))
      prepare build(sort: [inserted_at: :asc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :reason, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:sender, :moderator, :retention]
    end

    attribute :actor_did, :string do
      allow_nil? false
      public? true
      description "DID of the deleter (sender, moderator, or the server for retention)."
    end

    attribute :signature, :binary do
      allow_nil? false
      public? true

      description "Raw 64-byte ed25519 signature over canonical-JSON {message_id, reason, actor_did, ts}."
    end

    attribute :signed_by, :string do
      allow_nil? false
      public? true
      description "Device id (UUID) of the device subkey that signed the delete."
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :message, Yawp.Servers.Message do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  @type t :: %__MODULE__{}
end
