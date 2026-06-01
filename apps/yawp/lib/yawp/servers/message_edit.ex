defmodule Yawp.Servers.MessageEdit do
  @moduledoc """
  An append-only signed edit superseding a `Yawp.Servers.Message` body
  (ADR 019).

  Edits never overwrite: the original message and every subsequent edit
  are retained. Each edit is signed by the original sender's device
  subkey — a message can only be edited by its own author. The `:append`
  action verifies the signature over the canonical-JSON envelope and
  rejects edits not signed by the original sender's device subkey.

  `edit_serial` is a per-message monotonic counter; the UI renders the
  highest-serial edit by default with a "view edit history" affordance
  over the earlier versions.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  @max_body_length 4000

  postgres do
    table "server_message_edits"
    repo Yawp.Repo

    references do
      reference :message, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :append do
      description """
      Appends a signed edit after verifying the signature was produced
      by the original sender's device subkey.

      Signature contract: `signature` is base64url(64 bytes) ed25519
      over the RFC 8785 canonical-JSON encoding of
      `{message_id, body, ts}` where `ts` is a millisecond epoch integer.
      """

      accept [:message_id, :body, :signed_by]

      argument :signature, :string, allow_nil?: false
      argument :ts, :integer, allow_nil?: false

      change Yawp.Servers.MessageEdit.Changes.VerifyEditSignature
      change Yawp.Servers.MessageEdit.Changes.AssignEditSerial
    end

    read :list_for_message do
      description "All edits for a message, ordered ASC by edit_serial."
      argument :message_id, :uuid, allow_nil?: false

      filter expr(message_id == ^arg(:message_id))
      prepare build(sort: [edit_serial: :asc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :body, :string do
      allow_nil? false
      public? true
      constraints max_length: @max_body_length
    end

    attribute :edit_serial, :integer do
      allow_nil? false
      public? true
      description "Per-message monotonic edit counter; highest serial is the current body."
    end

    attribute :sender_signature, :binary do
      allow_nil? false
      public? true
      description "Raw 64-byte ed25519 signature over canonical-JSON {message_id, body, ts}."
    end

    attribute :signed_by, :string do
      allow_nil? false
      public? true
      description "Device id (UUID) of the original sender's device subkey."
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

  identities do
    identity :unique_message_edit_serial, [:message_id, :edit_serial]
  end

  def max_body_length, do: @max_body_length

  @type t :: %__MODULE__{}
end
