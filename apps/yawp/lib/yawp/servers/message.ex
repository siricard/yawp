defmodule Yawp.Servers.Message do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  @max_body_length 4000

  postgres do
    table "server_messages"
    repo Yawp.Repo

    references do
      reference :channel, on_delete: :delete
      reference :reply_to_message, on_delete: :nilify
    end
  end

  typescript do
    type_name "ServerMessage"
  end

  actions do
    defaults [:read]

    action :search, {:array, :struct} do
      constraints instance_of: __MODULE__

      argument :server_id, :uuid, allow_nil?: false
      argument :query, :string, allow_nil?: false
      argument :limit, :integer, allow_nil?: false, default: 50

      run Yawp.Servers.Message.Search
    end

    create :send do
      description """
      Persists a channel message after verifying its ed25519 signature.

      Signature contract: `signature` is base64url(64 bytes) ed25519
      over the RFC 8785 canonical-JSON encoding of
      `{channel_id, sender_did, body, reply_to_message_id, mentions,
      attachments, ts}` where `ts` is a millisecond epoch integer. The
      signing key is the `signed_by` device subkey registered on the
      sender identity's `device_subkeys.subkeys` list.
      """

      accept [
        :channel_id,
        :sender_did,
        :body,
        :reply_to_message_id,
        :mentions,
        :attachments,
        :signed_by
      ]

      argument :signature, :string, allow_nil?: false
      argument :ts, :integer, allow_nil?: false

      change Yawp.Servers.Message.Changes.EnforceAttachmentCaps
      change Yawp.Servers.Message.Changes.VerifySendSignature
      change Yawp.Servers.Message.Changes.AssignServerSerial
      change set_attribute(:server_inserted_at, &DateTime.utc_now/0)
      change Yawp.Servers.Message.Changes.FanOutNotifications
    end

    update :wipe_body do
      description "Clears the body in place, preserving the timeline slot (tombstone path)."
      accept []
      require_atomic? false
      change set_attribute(:body, nil)
    end

    read :list_for_channel do
      description "All non-future messages for a channel, ordered ASC by server_serial."
      argument :channel_id, :uuid, allow_nil?: false

      filter expr(channel_id == ^arg(:channel_id))
      prepare build(sort: [server_serial: :asc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :sender_did, :string do
      allow_nil? false
      public? true
      description "DID of the message author."
    end

    attribute :body, :string do
      allow_nil? true
      public? true
      constraints max_length: @max_body_length
      description "Message text. Nullable: wiped to nil by a tombstone on delete."
    end

    attribute :mentions, {:array, :string} do
      allow_nil? false
      default []
      public? true
      description "DIDs mentioned in this message."
    end

    attribute :attachments, {:array, :map} do
      allow_nil? false
      default []
      public? true
      description "Attachment descriptors (url, kind, etc.)."
    end

    attribute :sender_signature, :binary do
      allow_nil? false
      public? true
      description "Raw 64-byte ed25519 signature over the canonical-JSON envelope."
    end

    attribute :signed_by, :string do
      allow_nil? false
      public? true
      description "Device id (UUID) of the device subkey that signed this message."
    end

    attribute :server_serial, :integer do
      allow_nil? false
      public? true

      description """
      Per-channel monotonic insertion serial. Server-authoritative
      ordering renders by this value, never by the client `ts`.
      """
    end

    create_timestamp :inserted_at
    attribute :server_inserted_at, :utc_datetime_usec, allow_nil?: false, public?: true
  end

  relationships do
    belongs_to :channel, Yawp.Servers.Channel do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :reply_to_message, Yawp.Servers.Message do
      allow_nil? true
      attribute_writable? true
      public? true
    end
  end

  identities do
    identity :unique_channel_serial, [:channel_id, :server_serial]
  end

  def max_body_length, do: @max_body_length

  @type t :: %__MODULE__{}
end
