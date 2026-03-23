defmodule Yawp.Servers.Channel do
  @moduledoc """
  A channel on a server.

   scope-locked minimal schema: id (uuid), server_id (uuid, FK),
  name (string), type (atom: :text | :voice), inserted_at. No SFU
  wiring — that's M8.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_channels"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:server_id, :name, :type]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :type, :atom do
      allow_nil? false
      constraints one_of: [:text, :voice]
      public? true
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
