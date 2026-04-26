defmodule Yawp.Identity.Identity do
  @moduledoc """
  The DID-bearing chat identity row, stored at the user's home anchor.

   adds a deliberately minimal stub: just the primary key, the DID,
  and the master Ed25519 public key. Onboarding populates the
  row when the client completes the BIP-39 mnemonic flow; subsequent
  milestones extend this resource with device subkeys, the PPE
  bundle, the anchor list, recovery methods, etc.

  See (identity model) (anchor architecture)
  (identity recovery).
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "identities"
    repo Yawp.Repo

    migration_defaults device_subkeys: ~s|fragment("'{\\"subkeys\\": []}'::jsonb")|
  end

  typescript do
    type_name "Identity"
  end

  actions do
    defaults [:read]

    create :claim_chat_owner do
      description """
      Pre-auth chat-owner claim flow. The request
      is authenticated by the ed25519 signature over the canonical
      claim payload — the action runs with `actor: nil` and
      `authorize?: false`, but the `VerifySenderSignature` change
      gates execution before any write occurs. Multi-resource
      orchestration (consume token, upsert identity, assign Owner
      role, audit) runs inside the action's implicit transaction;
      failure rolls back everything.

      Replaces the legacy `:upsert_chat_owner` action and the
      hand-rolled `POST /api/claim` controller.
      """

      accept []

      argument :claim_token, :string, allow_nil?: false
      argument :did, :string, allow_nil?: false
            argument :pk, :string, allow_nil?: false
            argument :sender_signature, :string, allow_nil?: false

      upsert? true
      upsert_identity :unique_did

            change Yawp.Identity.Identity.Changes.DecodeClaimPayload
      change Yawp.Identity.Identity.Changes.VerifyDidDerivation
      change Yawp.Identity.Identity.Changes.VerifySenderSignature
      change Yawp.Identity.Identity.Changes.ConsumeClaimToken
      change Yawp.Identity.Identity.Changes.AssignOwnerRole
      change Yawp.Identity.Identity.Changes.WriteClaimAudit
    end

    read :get_chat_owner do
      description "Returns the singleton chat-owner row (or nil)."
      get? true
      prepare build(limit: 1)
    end

    read :get_by_did do
      description "Look up an Identity by DID."
      get_by [:did]
    end

    update :revoke_device_sessions do
      description """
      revokes every session + refresh
      token belonging to `(actor.id, device_id)`. The actor MUST be
      the Identity being targeted. Unauthorized callers receive
      `Yawp.RpcError type: "unauthorized"`.

      No row attributes change; the side effect lives in the
      `RevokeDeviceSessions` change which calls
      `Yawp.Identity.revoke_all_for_device/2`.
      """

      require_atomic? false
      accept []

      argument :device_id, :uuid, allow_nil?: false

      change Yawp.Identity.Identity.Changes.RevokeDeviceSessions
    end

    update :bind_device do
      description """
      binds a new device subkey to an existing chat identity. Pre-auth: gated by `sender_signature` over
      the canonical request body, signed by the device subkey itself.
      The master-key `device_signature` attests "this device is mine"
      via canonical-JSON over `{device_id, pk, issued_at}`.

      Operates on an existing Identity row keyed by `did`. On
      success issues a session+refresh pair returned as action
      metadata (`session_token`, `refresh_token`, `expires_at`).
      """

      require_atomic? false

      argument :device_id, :uuid, allow_nil?: false
            argument :device_pk, :string, allow_nil?: false
                  argument :device_signature, :string, allow_nil?: false
                  argument :sender_signature, :string, allow_nil?: false
                                    argument :issued_at, :string, allow_nil?: false

      metadata :session_token, :string
      metadata :refresh_token, :string
      metadata :expires_at, :utc_datetime_usec

      change Yawp.Identity.Identity.Changes.DecodeBindPayload
      change Yawp.Identity.Identity.Changes.ValidateIssuedAt
      change Yawp.Identity.Identity.Changes.VerifyBindSenderSignature
      change Yawp.Identity.Identity.Changes.VerifyDeviceDelegation
      change Yawp.Identity.Identity.Changes.AppendDeviceSubkey
      change Yawp.Identity.Identity.Changes.AppendAnchorUrl
      change Yawp.Identity.Identity.Changes.BumpProfileVersion
      change Yawp.Identity.Identity.Changes.IssueSessionPair
      change Yawp.Identity.Identity.Changes.WriteBindAudit
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :did, :string do
      allow_nil? false
      public? true
      description "did:yawp:<base58(sha256(master_public_key))>."
    end

    attribute :master_public_key, :binary do
      allow_nil? false
      public? true
      description "Raw 32-byte Ed25519 master public key."
    end

    attribute :device_subkeys, :map do
      allow_nil? false
      public? true
      default %{"subkeys" => []}

      description """
      JSON object holding the user's bound device subkeys. Shape:
      `%{"subkeys" => [%{"device_id" => uuid, "pk" => base64url(32),
      "signature" => base64url(64), "issued_at" => iso8601}, ...]}`.
      Persisted as JSONB. Stays inline on the row ; a dedicated
      resource (if needed) lands in alongside PPE + recovery.
      """
    end

    attribute :anchor_list, {:array, :string} do
      allow_nil? false
      public? true
      default []

      description """
      List of anchor URLs this identity has bound itself to.
      appends the singleton-anchor URL on first bind; subsequent
      anchors append as the user adds devices/servers.
      """
    end

    attribute :profile_version, :integer do
      allow_nil? false
      public? true
      default 0

      description """
      Monotonic counter bumped on every PPE/anchor-list change. The
      PPE refresh protocol uses this for conflict
      resolution between anchors.
      """
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_did, [:did]
    identity :unique_master_public_key, [:master_public_key]
  end
end
