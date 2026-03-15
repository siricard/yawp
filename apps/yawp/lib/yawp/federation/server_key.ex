defmodule Yawp.Federation.ServerKey do
  @moduledoc """
  Federation server keypair,.

  Each anchor holds one or more Ed25519 server keypairs used to sign
  federation envelopes (delivery wrappers, sync messages, presence
  pushes). The private key is encrypted at rest via `ash_cloak`. The
  matching public key document is published at
  `/.well-known/yawp/server-key.json` for peer discovery.

  Keys carry an explicit validity window (`not_before` /
  `not_after`) so operators can roll a fresh key without a flag day
  and `revoked_at` for compromise.

  All operations are exposed as Ash actions and reached through the
  domain `code_interface`: `Yawp.Federation.generate_server_key/1`,
  `Yawp.Federation.get_active_server_key/0`,
  `Yawp.Federation.list_published_server_keys/0`,
  `Yawp.Federation.revoke_server_key/1`.

  TODO: once an admin actor concept is wired in, layer a
  policies block authorizing `:generate` for any actor (boot has no
  actor) and restricting `:revoke` to operator/system actors. Holding
  off here to keep this refactor scoped.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Federation,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshCloak]

  postgres do
    table "federation_server_keys"
    repo Yawp.Repo
  end

  cloak do
    vault(Yawp.Vault)
    attributes [:private_key]
    decrypt_by_default([:private_key])
  end

  actions do
    defaults [:read]

    create :generate do
      description "Generates a fresh Ed25519 server keypair within an optional validity window. Used at boot to bootstrap an anchor's first key and later for rotation."
      accept []

      argument :key_id, :string, allow_nil?: true
      argument :not_before, :utc_datetime_usec, allow_nil?: true
      argument :not_after, :utc_datetime_usec, allow_nil?: true

      change Yawp.Federation.ServerKey.Changes.GenerateKeypair
    end

    create :create do
      description "Persists a server key with explicit public/private bytes — used only by tests and fixtures. Production paths use :generate."
      primary? true
      accept [:key_id, :public_key, :private_key, :not_before, :not_after]
    end

    update :revoke do
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    read :get_active do
      description "Returns the active (in-window, non-revoked) key with the latest not_before, or nil."
      get? true
      filter expr(is_nil(revoked_at) and not_before <= now() and not_after >= now())
      prepare build(sort: [not_before: :desc], limit: 1, load: [:private_key])
    end

                
    read :list_active do
      description "All in-window, non-revoked keys, newest first."
      filter expr(is_nil(revoked_at) and not_before <= now() and not_after >= now())
      prepare build(sort: [not_before: :desc])
    end

    read :list_published do
      description "All non-revoked keys (regardless of window) — what the well-known endpoint publishes."
      filter expr(is_nil(revoked_at))
      prepare build(sort: [not_before: :desc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :key_id, :string do
      allow_nil? false
      public? true
      description "Short identifier referenced in signed envelopes (e.g. \"k-2026-05-23-abc\")."
    end

    attribute :public_key, :binary do
      allow_nil? false
      public? true
      description "Raw 32-byte Ed25519 public key."
    end

    attribute :private_key, :binary do
      allow_nil? false
      sensitive? true
      description "Raw 32-byte Ed25519 private key seed. Encrypted at rest via Yawp.Vault."
    end

    attribute :not_before, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :not_after, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    attribute :revoked_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_key_id, [:key_id]
  end

  @type t :: %__MODULE__{}
end
