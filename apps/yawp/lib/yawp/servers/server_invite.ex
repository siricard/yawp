defmodule Yawp.Servers.ServerInvite do
  @moduledoc """
  server-level invite, mintable by the chat-owner from the
  admin panel and redeemable by a prospective Member from the
  Add-server flow.

  An invite token is a 128-bit random value (encoded as 26 chars of
  unpadded base32). Two kinds are supported:

    * `:single_use` — consumed on first successful redemption
      (`consumed_at` stamp). Replay returns `invite_token_consumed`.
    * `:multi_use` — counted-down via `uses_remaining`; reaches zero
      and any further redemption returns `invite_token_exhausted`.

  Invites can also be revoked (`revoked_at`) and expire on
  `expires_at`. The error vocabulary surfaced on the redeem RPC is:

    * `invite_token_invalid` — token not found / malformed.
    * `invite_token_consumed` — single-use already consumed.
    * `invite_token_exhausted` — multi-use ran out.
    * `invite_token_expired` — past `expires_at`.
    * `invite_token_revoked` — revoked by the chat owner.

  See `Yawp.Servers.ServerInvite.Changes.MintToken` for the minting
  flow and `Yawp.Servers.ServerInvite.Changes.RedeemInvite` for the
  redeem-path orchestration (signature verify → consume → membership).
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "server_invites"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :created_by_identity, on_delete: :delete
    end
  end

  typescript do
    type_name "ServerInvite"
  end

  actions do
    defaults [:read, :destroy]

    create :mint do
      description """
      Mint a fresh server invite. Generates the random token, sets
      defaults (single-use, 24h TTL), stamps `created_by_identity_id`.
      """

      accept []

      argument :server_id, :uuid, allow_nil?: false

      argument :kind, :atom,
        default: :single_use,
        constraints: [one_of: [:single_use, :multi_use]]

      argument :ttl_seconds, :integer, default: 24 * 60 * 60
      argument :uses_remaining, :integer, allow_nil?: true

      change Yawp.Servers.ServerInvite.Changes.VerifyServerOwnership
      change Yawp.Servers.ServerInvite.Changes.ValidateMintKind
      change Yawp.Servers.ServerInvite.Changes.MintToken
    end

    update :revoke do
      description "Marks the invite as revoked."
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    update :consume_single_use do
      description """
      atomically stamp `consumed_at` on a single-use invite
      iff it is still active (unconsumed, unrevoked, unexpired).
      Concurrency-safe via filter+atomic_update (same pattern as the
      claim-token `:consume_if_active`).
      """

      accept []
      require_atomic? false

      change filter(
               expr(
                 kind == :single_use and is_nil(consumed_at) and is_nil(revoked_at) and
                   expires_at > now()
               )
             )

      change atomic_update(:consumed_at, expr(now()))
    end

    update :decrement_multi_use do
      description """
      atomically decrement `uses_remaining` on a multi-use
      invite iff `uses_remaining > 0` (and the invite is otherwise
      active). When the counter hits zero the row is also stamped
      `consumed_at` so subsequent reads classify as exhausted.
      """

      accept []
      require_atomic? false

      change filter(
               expr(
                 kind == :multi_use and uses_remaining > 0 and is_nil(revoked_at) and
                   expires_at > now()
               )
             )

      change atomic_update(:uses_remaining, expr(uses_remaining - 1))

      change atomic_update(
               :consumed_at,
               expr(if(uses_remaining - 1 == 0, do: now(), else: consumed_at))
             )
    end

    update :force_expire do
      description "Test-only: rewrites `expires_at` to simulate an expired invite."
      accept [:expires_at]
    end

    read :get_by_token do
      description "Look up an invite by token value, regardless of state."
      get_by [:token]
    end

    read :get_by_id do
      description "Look up an invite by id, regardless of state."
      get_by [:id]
    end

    read :list_active_for_server do
      description "Lists currently-active invites for the given server."
      argument :server_id, :uuid, allow_nil?: false

      filter expr(
               server_id == ^arg(:server_id) and is_nil(revoked_at) and
                 is_nil(consumed_at) and expires_at > now()
             )

      prepare build(sort: [inserted_at: :desc])
    end

    action :redeem, :map do
      description """
      pre-auth signed RPC. The prospective member signs the
      canonical-JSON payload `%{"token" => ..., "did" => ..., "pk" => ...}`
      with their master ed25519 key. On success the action:

        1. Verifies the sender_signature.
        2. Validates DID derivation against `pk`.
        3. Upserts the redeemer's `Yawp.Identity.Identity` row.
        4. Atomically consumes / decrements the invite (race-safe).
        5. Assigns the redeemer the Member role on the invite's server.
        6. Records an `invite.redeem` audit entry.

      Returns `%{server_id: <uuid>, role: "Member"}` on success.
      """

      argument :token, :string, allow_nil?: false
      argument :did, :string, allow_nil?: false
      argument :pk, :string, allow_nil?: false
      argument :sender_signature, :string, allow_nil?: false

      constraints fields: [
                    server_id: [type: :uuid],
                    role: [type: :string]
                  ]

      run Yawp.Servers.ServerInvite.Redeem
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :token, :string do
      allow_nil? false
      public? true
    end

    attribute :kind, :atom do
      allow_nil? false
      default :single_use
      constraints one_of: [:single_use, :multi_use]
      public? true
    end

    attribute :uses_remaining, :integer do
      allow_nil? true
      public? true
    end

    attribute :expires_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :consumed_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    attribute :revoked_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :server, Yawp.Servers.Server do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :created_by_identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      attribute_type :uuid
      public? true
      source_attribute :created_by_identity_id
    end
  end

  identities do
    identity :unique_token, [:token]
  end

  @type t :: %__MODULE__{}
end
