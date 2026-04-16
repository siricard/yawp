defmodule Yawp.Identity.SessionToken do
  @moduledoc """
  server-side opaque session token.

  A session token is a 128-bit random value, base64url-encoded
  unpadded (22 chars), bound to an `Yawp.Identity.Identity` and a
  `device_id` (uuid). Used on every authenticated chat request via
  the `Authorization: Bearer <token>` header.

  Default TTL is 60 minutes; rotation is driven by the paired
  `Yawp.Identity.RefreshToken`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer

  @ttl_seconds 60 * 60

  @doc "Default session TTL in seconds (1 hour)."
  def ttl_seconds, do: @ttl_seconds

  postgres do
    table "identity_session_tokens"
    repo Yawp.Repo

    references do
      reference :identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :issue do
      description "Mints a fresh session token for an identity + device."
      accept [:identity_id, :device_id]

      change Yawp.Identity.SessionToken.Changes.MintToken
    end

    update :revoke do
      description "Marks the session as revoked (immediate)."
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    read :get_by_token do
      description "Look up a session by its opaque token, regardless of state."
      get_by [:token]
    end

    read :get_valid_by_token do
      description "Look up an active (unrevoked, unexpired) session by token."
      get? true
      argument :token, :string, allow_nil?: false

      filter expr(token == ^arg(:token) and is_nil(revoked_at) and expires_at > now())
    end

    update :force_expire do
      description "Test-only: rewrites `expires_at` to simulate expiration."
      accept [:expires_at]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :token, :string do
      allow_nil? false
      public? true
      description "22-char base64url(16 random bytes)."
    end

    attribute :identity_id, :uuid, allow_nil?: false, public?: true
    attribute :device_id, :uuid, allow_nil?: false, public?: true

    attribute :expires_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :revoked_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      attribute_type :uuid
      public? true
      source_attribute :identity_id
    end
  end

  identities do
    identity :unique_token, [:token]
  end

  @type t :: %__MODULE__{}
end
