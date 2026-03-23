defmodule Yawp.Servers.Role do
  @moduledoc """
  A role on a server.

   scope-locked minimal schema: id (uuid), server_id (uuid, FK),
  name (string), system (boolean), permissions (map; `%{}` placeholder),
  inserted_at. Real RBAC grammar lands .

  The three system roles (`Owner`, `Admin`, `Member`) are seeded for
  every server with `system: true`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_roles"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:server_id, :name, :system, :permissions]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :system, :boolean do
      allow_nil? false
      default false
      public? true
    end

    attribute :permissions, :map do
      allow_nil? false
      default %{}
      public? true
      description "Placeholder for the RBAC grammar (not implemented yet)."
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :server, Yawp.Servers.Server do
      allow_nil? false
      attribute_writable? true
    end
  end

  identities do
    identity :unique_server_id_name, [:server_id, :name]
  end

  @type t :: %__MODULE__{}
end
