defmodule Yawp.Servers.Channel do
  @moduledoc """
  A channel (room) on a server (ADR 018).

  Carries the server FK, an optional category FK, the channel `name`,
  its `type` (`:text` | `:voice`), the sidebar `position`, the
  `visibility` (`:server_public` | `:private`), and the `join_policy`
  (`:invite_only` | `:open`). No SFU wiring — that's the voice phase.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "server_channels"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :category, on_delete: :nilify
    end
  end

  typescript do
    type_name "ServerChannel"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:server_id, :category_id, :name, :type, :position, :visibility, :join_policy]

      change Yawp.Servers.Changes.RequireManageChannels
    end

    update :recategorize do
      description "Moves a channel into (or out of) a category and sets its position."
      accept [:category_id, :position]
      require_atomic? false

      change Yawp.Servers.Changes.RequireManageChannels
    end

    update :reposition do
      description "Sets the sidebar ordering position of this channel."
      accept [:position]
    end

    action :reorder, :integer do
      description "Assigns positions to channels in the supplied order on a server."

      argument :server_id, :uuid, allow_nil?: false
      argument :ordered_ids, {:array, :uuid}, allow_nil?: false

      run Yawp.Servers.Channel.Reorder
    end

    read :list_text_channels do
      description """
      returns every text channel across all servers on this
      anchor. has a singleton server with one text channel
      (`#general`), so the client picks the first entry. layers
      a real per-server channel sidebar on top.
      """

      filter expr(type == :text)
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

    attribute :position, :integer do
      allow_nil? false
      default 0
      public? true
      description "Sidebar ordering within the category; lower sits first."
    end

    attribute :visibility, :atom do
      allow_nil? false
      default :server_public
      constraints one_of: [:server_public, :private]
      public? true
    end

    attribute :join_policy, :atom do
      allow_nil? false
      default :invite_only
      constraints one_of: [:invite_only, :open]
      public? true
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :server, Yawp.Servers.Server do
      allow_nil? false
      attribute_writable? true
      public? true
    end

    belongs_to :category, Yawp.Servers.Category do
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
