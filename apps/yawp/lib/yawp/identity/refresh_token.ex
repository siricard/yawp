defmodule Yawp.Identity.RefreshToken do
  @moduledoc """
  server-side opaque refresh token.

  Same shape as `Yawp.Identity.SessionToken` plus a nullable
  `rotated_to` FK pointing at the successor refresh row when this
  refresh has been consumed via `rotate/1`. Default TTL 14 days.

  `issue_pair/2` is implemented as a `create` action on this resource
  that, in an `after_action`, ALSO creates a paired session token in
  the same action transaction. `rotate/1` atomically marks the
  supplied refresh's `rotated_to` and issues a fresh pair.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer

  @ttl_seconds 14 * 24 * 60 * 60

  @doc "Default refresh TTL in seconds (14 days)."
  def ttl_seconds, do: @ttl_seconds

  postgres do
    table "identity_refresh_tokens"
    repo Yawp.Repo

    references do
      reference :identity, on_delete: :delete
      reference :rotated_to_refresh, on_delete: :nilify, name: "refresh_tokens_rotated_to_fkey"
    end
  end

  actions do
    defaults [:read]

    create :issue_pair do
      description """
      Issues a session+refresh pair for the given identity + device.
      Both rows are inserted in this action's implicit transaction;
      a failure rolls back everything.

      Returns the refresh-token row with the paired session token on
      action metadata `:paired_session_token`.
      """

      accept [:identity_id, :device_id]

      metadata :paired_session_token, :struct,
        constraints: [instance_of: Yawp.Identity.SessionToken]

      change Yawp.Identity.RefreshToken.Changes.MintTokenPair
    end

    update :revoke do
      description "Marks the refresh as revoked (immediate)."
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    update :mark_rotated do
      description """
      Atomically flips `rotated_to` to the successor refresh id, but
      only if the row is currently active (unrotated, unrevoked,
      unexpired). Used internally by `Yawp.Identity.rotate_refresh/1`.

      `require_atomic? false` is used so `change filter/1` is
      preserved (see ADR-aside in `Yawp.Admin.ClaimToken.consume_if_active`).
      """

      accept [:rotated_to]
      require_atomic? false
      argument :rotated_to, :uuid, allow_nil?: false

      change filter(expr(is_nil(rotated_to) and is_nil(revoked_at) and expires_at > now()))

      change atomic_update(:rotated_to, expr(^arg(:rotated_to)))
    end

    read :get_by_token do
      description "Look up a refresh by token, regardless of state."
      get_by [:token]
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

    attribute :rotated_to, :uuid do
      allow_nil? true
      public? true

      description """
      FK to the successor refresh-token row, set in the same
      transaction that issues the new pair via `rotate/1`. Null on a
      still-active refresh.
      """
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

    belongs_to :rotated_to_refresh, Yawp.Identity.RefreshToken do
      allow_nil? true
      attribute_writable? false
      attribute_type :uuid
      public? true
      source_attribute :rotated_to
      define_attribute? false
    end
  end

  identities do
    identity :unique_token, [:token]
  end

  @type t :: %__MODULE__{}
end
