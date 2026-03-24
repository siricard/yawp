defmodule Yawp.Admin.ClaimToken do
  @moduledoc """
  Single-use claim token for the chat-owner claim flow.

  A claim token is a 128-bit random value (encoded as 26 chars of
  unpadded base32) with a 15-minute TTL. The operator generates one
  in the `/admin` dashboard and hands it to the prospective chat
  owner out-of-band; the chat owner posts it to `POST /api/claim`
  along with their DID + master public key + signature, which the
  controller verifies and consumes.

  Only one active token can exist at any time — minting a new one
  automatically revokes any prior unconsumed/unrevoked/unexpired
  token (see `Yawp.Admin.ClaimToken.Changes.MintToken`).
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Admin,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "admin_claim_tokens"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :generate do
      description "Mints a fresh claim token, revoking any active token first."
      accept []

      argument :created_by_account_id, :uuid, allow_nil?: false

      change Yawp.Admin.ClaimToken.Changes.MintToken
    end

    update :revoke do
      description "Marks the token as revoked."
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    update :consume do
      description "Marks the token as consumed (single-use)."
      accept []
      change set_attribute(:consumed_at, &DateTime.utc_now/0)
    end

    update :force_expire do
      description "Test-only: rewrites `expires_at` to simulate an expired token."
      accept [:expires_at]
    end

    read :get_active do
      description "Most-recent unconsumed, unrevoked, unexpired token."
      get? true
      filter expr(is_nil(consumed_at) and is_nil(revoked_at) and expires_at > now())
      prepare build(sort: [inserted_at: :desc], limit: 1)
    end

    read :get_by_token do
      description "Look up a token by value, regardless of state."
      get_by [:token]
    end

    read :get_by_id do
      description "Look up a token by id, regardless of state."
      get_by [:id]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :token, :string do
      allow_nil? false
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

    attribute :created_by_account_id, :uuid do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_token, [:token]
  end

  @type t :: %__MODULE__{}
end
