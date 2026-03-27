defmodule Yawp.Servers.Membership do
  @moduledoc """
  Join row between an `Yawp.Identity.Identity` and a `Yawp.Servers.Role`
  on a `Yawp.Servers.Server`.

  b lands the minimal columns needed to record the chat-owner →
  `Owner`-role assignment after a successful claim. Richer membership
  data (profile, joined_at, channel-level overrides) lands .
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_memberships"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :role, on_delete: :delete
      reference :identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:identity_id, :server_id, :role_id]
      upsert? true
      upsert_identity :unique_identity_server
    end
  end

  attributes do
    uuid_primary_key :id

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :server, Yawp.Servers.Server do
      allow_nil? false
      attribute_writable? true
    end

    belongs_to :role, Yawp.Servers.Role do
      allow_nil? false
      attribute_writable? true
    end
  end

  identities do
    identity :unique_identity_server, [:identity_id, :server_id]
  end

  @type t :: %__MODULE__{}
end
