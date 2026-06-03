defmodule Yawp.Identity.PrivateBlob do
  @moduledoc """
  The user's client-encrypted private settings blob, stored at the
  anchor as opaque ciphertext keyed by DID.

  The anchor never reads inside the blob — it holds the ciphertext and
  the user-signed `blob_version` and replicates both across the user's
  anchors. Higher `blob_version` wins on conflict, mirroring the PPE
  rule. The `ciphertext` column is encrypted at rest via the cloak
  vault so a database dump never reveals even the opaque blob.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshCloak]

  postgres do
    table "identity_private_blobs"
    repo Yawp.Repo
  end

  cloak do
    vault Yawp.Vault
    attributes [:ciphertext]
    decrypt_by_default [:ciphertext]
  end

  actions do
    defaults [:read]

    create :upsert do
      description "Inserts or overwrites the private blob for a DID. Apply-if-newer is enforced by the caller before invoking this action."

      accept [:did, :ciphertext, :blob_version]
      upsert? true
      upsert_identity :unique_did
    end

    read :get_by_did do
      description "Look up a private blob by DID."
      get_by [:did]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :did, :string do
      allow_nil? false
      public? true
      description "did:yawp:<...> the blob belongs to."
    end

    attribute :ciphertext, :binary do
      allow_nil? false
      sensitive? true
      description "Opaque client-encrypted settings blob. Encrypted at rest via Yawp.Vault."
    end

    attribute :blob_version, :integer do
      allow_nil? false
      default 0
      public? true
      description "Monotonic version signed by the user; higher wins on conflict."
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_did, [:did]
  end

  @type t :: %__MODULE__{}
end
