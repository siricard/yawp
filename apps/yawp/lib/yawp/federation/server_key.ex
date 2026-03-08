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
  and `revoked_at` for compromise. `active/0` returns the currently
  in-window, non-revoked key with the latest `not_before`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Federation,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshCloak]

  require Ash.Query

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

    create :create do
      primary? true
      accept [:key_id, :public_key, :private_key, :not_before, :not_after]
    end

    update :revoke do
      accept []
      change set_attribute(:revoked_at, &DateTime.utc_now/0)
    end

    read :list_active do
      filter expr(is_nil(revoked_at) and not_before <= now() and not_after >= now())
      prepare build(sort: [not_before: :desc])
    end

    read :get_active do
      get? true
      filter expr(is_nil(revoked_at) and not_before <= now() and not_after >= now())
      prepare build(sort: [not_before: :desc], limit: 1)
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

          
  @default_window_days 365

  @doc """
  Generates a fresh Ed25519 keypair, persists it (private key
  encrypted via Yawp.Vault), and returns the loaded record with the
  decrypted `private_key` calculation populated.

  Accepts `:not_before` and `:not_after` overrides for tests; default
  window is `now()` → `now() + 1 year`.
  """
  @spec generate(keyword()) :: {:ok, t()} | {:error, term()}
  def generate(opts \\ []) do
    {:ok, {public_key, private_key}} = generate_ed25519_keypair()
    now = DateTime.utc_now()
    not_before = Keyword.get(opts, :not_before, now)

    not_after =
      Keyword.get(opts, :not_after, DateTime.add(now, @default_window_days * 86_400, :second))

    key_id = Keyword.get_lazy(opts, :key_id, fn -> derive_key_id(public_key) end)

    __MODULE__
    |> Ash.Changeset.for_create(:create, %{
      key_id: key_id,
      public_key: public_key,
      private_key: private_key,
      not_before: not_before,
      not_after: not_after
    })
    |> Ash.create(load: [:private_key])
  end

  @doc """
  Returns the active (in-window, non-revoked) server key with the
  decrypted `private_key` loaded, or `{:error, :no_active_key}` if
  none exists.
  """
  @spec active() :: {:ok, t()} | {:error, :no_active_key}
  def active do
    case __MODULE__ |> Ash.Query.for_read(:get_active) |> Ash.read_one(load: [:private_key]) do
      {:ok, nil} -> {:error, :no_active_key}
      {:ok, record} -> {:ok, record}
      {:error, _} = err -> err
    end
  end

  @doc """
  Returns all non-revoked keys (regardless of window — for the
  well-known endpoint).
  """
  @spec list_published() :: [t()]
  def list_published do
    __MODULE__
    |> Ash.Query.filter(is_nil(revoked_at))
    |> Ash.Query.sort(not_before: :desc)
    |> Ash.read!()
  end

  @doc """
  Marks the given key revoked.
  """
  @spec revoke(t()) :: {:ok, t()} | {:error, term()}
  def revoke(key) do
    key
    |> Ash.Changeset.for_update(:revoke, %{})
    |> Ash.update()
  end

  @doc false
  @spec generate_ed25519_keypair() :: {:ok, {binary(), binary()}}
  def generate_ed25519_keypair do
    {public_key, private_key} = :crypto.generate_key(:eddsa, :ed25519)
    {:ok, {public_key, private_key}}
  end

  defp derive_key_id(public_key) do
    short_hash =
      :crypto.hash(:sha256, public_key)
      |> binary_part(0, 6)
      |> Base.encode16(case: :lower)

    "k-#{Date.to_iso8601(Date.utc_today())}-#{short_hash}"
  end

  @type t :: %__MODULE__{}
end
