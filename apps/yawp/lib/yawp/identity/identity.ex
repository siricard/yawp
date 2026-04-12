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

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_did, [:did]
    identity :unique_master_public_key, [:master_public_key]
  end
end
