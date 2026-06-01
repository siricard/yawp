defmodule Yawp.Servers.Category do
  @moduledoc """
  A named grouping of channels within a server.

  Categories are pure UI organization — they carry no permissions in v1.
  Each channel belongs to at most one category, and the sidebar sorts
  channels by `position` within a category and categories by `position`
  across the server.

  The self-referential `parent_id` shapes the data for deeper nesting
  later without a migration; v1 caps depth at one level, enforced in the
  `:create` action rather than at the schema layer.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "server_categories"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :parent, on_delete: :delete
    end
  end

  typescript do
    type_name "ServerCategory"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:server_id, :name, :parent_id, :position]

      change Yawp.Servers.Changes.EnforceCategoryDepth
      change Yawp.Servers.Changes.RequireManageChannels
    end

    update :reposition do
      description "Sets the sidebar ordering position of this category."
      accept [:position]
    end

    action :reorder, :integer do
      description "Assigns positions to categories in the supplied order on a server."

      argument :server_id, :uuid, allow_nil?: false
      argument :ordered_ids, {:array, :uuid}, allow_nil?: false

      run Yawp.Servers.Category.Reorder
    end

    read :list_for_server do
      description "All categories on the given server, ordered by position."
      argument :server_id, :uuid, allow_nil?: false
      filter expr(server_id == ^arg(:server_id))
      prepare build(sort: [position: :asc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :position, :integer do
      allow_nil? false
      default 0
      public? true
      description "Sidebar ordering across categories; lower sits first."
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :server, Yawp.Servers.Server do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :parent, Yawp.Servers.Category do
      allow_nil? true
      attribute_writable? true
      public? true
    end
  end

  identities do
    identity :unique_server_id_name, [:server_id, :name]
  end

  @type t :: %__MODULE__{}
end
