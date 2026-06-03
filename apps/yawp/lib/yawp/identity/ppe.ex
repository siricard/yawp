defmodule Yawp.Identity.Ppe do
  @moduledoc """
  Cached Public Profile Envelope for an identity, keyed by DID.

  An anchor stores the canonical, user-signed PPE for each of its
  users; a guest server caches the PPEs of users present in its rooms
  so it can render display names and avatars. Both populate this table
  via the federation push/pull path.

  Conflict resolution is by `profile_version`: a higher version wins,
  a lower-or-equal version is a no-op. The full signed envelope is kept
  in `envelope` so the strict schema validation and signature checks
  can read every field; the frequently-queried fields (`display_name`,
  `avatar_ref`, `bio`) are promoted to their own columns.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "identity_ppes"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :upsert do
      description "Inserts or overwrites the cached PPE for a DID. Apply-if-newer is enforced by the caller before invoking this action."

      accept [:did, :display_name, :avatar_ref, :bio, :profile_version, :envelope]
      upsert? true
      upsert_identity :unique_did
    end

    read :get_by_did do
      description "Look up a cached PPE by DID."
      get_by [:did]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :did, :string do
      allow_nil? false
      public? true
      description "did:yawp:<...> the PPE belongs to."
    end

    attribute :display_name, :string do
      allow_nil? true
      public? true
    end

    attribute :avatar_ref, :string do
      allow_nil? true
      public? true
    end

    attribute :bio, :string do
      allow_nil? true
      public? true
    end

    attribute :profile_version, :integer do
      allow_nil? false
      default 0
      public? true
      description "Monotonic version from the signed envelope; higher wins on conflict."
    end

    attribute :envelope, :map do
      allow_nil? false
      public? true
      description "The full user-signed PPE payload as received over federation."
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_did, [:did]
  end

  @type t :: %__MODULE__{}
end
