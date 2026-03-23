defmodule Yawp.Servers.Server do
  @moduledoc """
  The singleton server row representing this anchor.

   scope-locked minimal schema: id (uuid), name (string), inserted_at,
  updated_at. The richer columns — icon, banner, profile_version,
  federation fields — land .
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "servers"
    repo Yawp.Repo
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:name]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  @type t :: %__MODULE__{}
end
