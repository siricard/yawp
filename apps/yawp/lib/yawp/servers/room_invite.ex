defmodule Yawp.Servers.RoomInvite do
  @moduledoc """
  Channel-level invite (ADR 017 / ADR 019).

  Unlike `Yawp.Servers.ServerInvite` (which grants the Member role on the
  whole server), a room invite targets one channel and, on redemption,
  auto-promotes a stranger to a `:guest` membership scoped to read that
  one channel via an identity-level channel override.

  Two delivery shapes share the same row:

    * **Warm invite** — the invite payload is delivered as a structured
      DM (`warm_invite_payload/2`). The DM transport itself lands with the
      DM milestone; the payload shape is defined here.
    * **Cold invite** — a `yawp://<host>/r/<channel_id>?token=...` URL
      (`cold_invite_url/2`) redeemable through the `:redeem` RPC.

  Token semantics mirror `ServerInvite`: 128-bit random value (26-char
  unpadded base32), `:single_use` (consumed on first redeem) or
  `:multi_use` (counted down via `uses_remaining`), time-limited
  (`expires_at`) and revocable (`revoked_at`).

  Redeem error vocabulary: `invite_token_invalid`, `invite_token_consumed`,
  `invite_token_exhausted`, `invite_token_expired`, `invite_token_revoked`,
  `invalid_signature`, `did_mismatch`, `invalid_payload`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "room_invites"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :channel, on_delete: :delete
      reference :created_by_identity, on_delete: :delete
    end
  end

  typescript do
    type_name "RoomInvite"
  end

  actions do
    defaults [:read, :destroy]

    create :create_invite do
      description """
      Mint a fresh channel invite. Gated by the `create_invite`
      permission bit resolved at the channel level. The token, TTL, and
      `uses_remaining` are derived; `channel_id`, `server_id`, and
      `created_by_identity_id` are stamped from the resolved channel and
      the Ash actor.
      """

      accept []

      argument :channel_id, :uuid, allow_nil?: false

      argument :kind, :atom,
        default: :single_use,
        constraints: [one_of: [:single_use, :multi_use]]

      argument :ttl_seconds, :integer, default: 24 * 60 * 60
      argument :uses_remaining, :integer, allow_nil?: true

      change Yawp.Servers.RoomInvite.Changes.VerifyChannelCreateInvite
      change Yawp.Servers.ServerInvite.Changes.ValidateMintKind
      change Yawp.Servers.RoomInvite.Changes.MintToken
    end

    update :revoke do
      description "Marks the invite as revoked."
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    update :consume_single_use do
      description "Atomically stamp `consumed_at` iff still active."
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
      description "Atomically decrement `uses_remaining` iff still active."
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
      description "Look up a room invite by token value, regardless of state."
      get_by [:token]
    end

    read :get_by_id do
      description "Look up a room invite by id, regardless of state."
      get_by [:id]
    end

    read :list_active_for_channel do
      description "Lists currently-active invites for the given channel."
      argument :channel_id, :uuid, allow_nil?: false

      filter expr(
               channel_id == ^arg(:channel_id) and is_nil(revoked_at) and
                 is_nil(consumed_at) and expires_at > now()
             )

      prepare build(sort: [inserted_at: :desc])
    end

    action :redeem, :map do
      description """
      Pre-auth signed RPC. The prospective member signs the
      canonical-JSON payload `%{"token" => ..., "did" => ..., "pk" => ...}`
      with their master Ed25519 key. On success the action:

        1. Verifies the sender_signature.
        2. Validates DID derivation against `pk`.
        3. Upserts the redeemer's `Yawp.Identity.Identity` row.
        4. Atomically consumes / decrements the invite (race-safe).
        5. Ensures a membership for the redeemer — auto-creating a
           `:guest` membership if none exists — and grants channel read
           access via an identity-level channel override.
        6. Records a `room_invite.redeem` audit entry.

      Returns `%{server_id, channel_id, kind}` on success, where `kind`
      is the membership kind string (`"guest"` for a freshly promoted
      stranger, or the existing kind for a prior member).
      """

      argument :token, :string, allow_nil?: false
      argument :did, :string, allow_nil?: false
      argument :pk, :string, allow_nil?: false
      argument :sender_signature, :string, allow_nil?: false

      constraints fields: [
                    server_id: [type: :uuid],
                    channel_id: [type: :uuid],
                    kind: [type: :string]
                  ]

      run Yawp.Servers.RoomInvite.Redeem
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

    belongs_to :channel, Yawp.Servers.Channel do
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

  @doc """
  Builds the cold-invite URL for an invite:
  `yawp://<host>/r/<channel_id>?token=<token>`.
  """
  @spec cold_invite_url(t(), String.t()) :: String.t()
  def cold_invite_url(invite, host) when is_binary(host) do
    "yawp://#{host}/r/#{invite.channel_id}?token=#{invite.token}"
  end

  @doc """
  Builds the warm-invite DM payload — the structured map a `room_invite`
  DM carries so the recipient client can redeem it without a paste step.
  The DM transport itself lands with the DM milestone; the shape is fixed
  here.
  """
  @spec warm_invite_payload(t(), String.t()) :: map()
  def warm_invite_payload(invite, host) when is_binary(host) do
    %{
      "type" => "room_invite",
      "token" => invite.token,
      "server_id" => invite.server_id,
      "channel_id" => invite.channel_id,
      "kind" => to_string(invite.kind),
      "url" => cold_invite_url(invite, host)
    }
  end

  @type t :: %__MODULE__{}
end
