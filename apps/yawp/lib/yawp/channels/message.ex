defmodule Yawp.Channels.Message do
  @moduledoc """
  A single text message in a channel.

  Each row carries the device-subkey ed25519 signature over the
  canonical-JSON payload `{channel_id, body, ts}` (ts = millisecond
  epoch). The `:send` action verifies the signature against the
  device-subkey public key resolved from the author identity's
  `device_subkeys` JSONB before persisting; failure short-circuits
  with `invalid_signature`.

  `server_inserted_at` is the server-authoritative ordering column reuses it as the wall-clock for federated ordering tie-breaks.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Channels,
    data_layer: AshPostgres.DataLayer

  @max_body_length 2000

  postgres do
    table "channel_messages"
    repo Yawp.Repo

    references do
      reference :channel, on_delete: :delete
      reference :author_identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :send do
      description """
      Persists a text message after verifying its ed25519 signature.

      Signature contract: `signature` is base64url(64 bytes) ed25519
      over the RFC 8785 canonical-JSON encoding of
      `{channel_id, body, ts}` where `ts` is a millisecond epoch
      integer. The signing key is the `signed_by` device subkey
      registered on the author identity's `device_subkeys.subkeys`
      list.
      """

      accept [:channel_id, :author_identity_id, :body, :signed_by]

      argument :signature, :string, allow_nil?: false
      argument :ts, :integer, allow_nil?: false

      change Yawp.Channels.Message.Changes.VerifyMessageSignature
      change set_attribute(:server_inserted_at, &DateTime.utc_now/0)
    end

    read :list_recent do
      description "The 50 most-recent messages for a channel, ordered ASC by server_inserted_at."
      argument :channel_id, :uuid, allow_nil?: false

      filter expr(channel_id == ^arg(:channel_id))

      prepare fn query, _ctx ->
        query
        |> Ash.Query.sort(server_inserted_at: :desc)
        |> Ash.Query.limit(50)
        |> Ash.Query.after_action(fn _q, results -> {:ok, Enum.reverse(results)} end)
      end
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :body, :string do
      allow_nil? false
      public? true
      constraints max_length: @max_body_length
    end

    attribute :signature, :binary do
      allow_nil? false
      public? true
      description "Raw 64-byte ed25519 signature over canonical-JSON {channel_id, body, ts}."
    end

    attribute :signed_by, :string do
      allow_nil? false
      public? true
      description "Device id (UUID) of the device subkey that signed this message."
    end

    attribute :server_inserted_at, :utc_datetime_usec do
      allow_nil? false
      public? true
      description "Server-authoritative ordering timestamp (set on create)."
    end
  end

  relationships do
    belongs_to :channel, Yawp.Servers.Channel do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :author_identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  def max_body_length, do: @max_body_length

  @type t :: %__MODULE__{}
end
