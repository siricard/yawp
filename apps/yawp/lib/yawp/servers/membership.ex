defmodule Yawp.Servers.Membership do
  @moduledoc """
  Join row between an `Yawp.Identity.Identity` and a `Yawp.Servers.Server`
  (ADR 017).

  A membership carries the set of `role_ids` assigned to the identity on
  this server, the membership `kind` (`:anchored` for users who anchor
  here, `:guest` for visitors), and the `banned` / `kicked` moderation
  flags consulted by `Yawp.Servers.Permissions.effective_bits/3`.
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
      reference :identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:identity_id, :server_id, :role_ids, :kind]
      upsert? true
      upsert_identity :unique_identity_server
    end

    update :set_roles do
      description "Replaces the role set assigned to this membership."
      accept [:role_ids]
    end

    update :set_moderation do
      description "Sets the banned / kicked moderation flags."
      accept [:banned, :kicked]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :role_ids, {:array, :uuid} do
      allow_nil? false
      default []
      public? true
      description "Role IDs assigned to this identity on this server."
    end

    attribute :kind, :atom do
      allow_nil? false
      default :anchored
      constraints one_of: [:anchored, :guest]
      public? true
    end

    attribute :banned, :boolean do
      allow_nil? false
      default false
      public? true
    end

    attribute :kicked, :boolean do
      allow_nil? false
      default false
      public? true
    end

    create_timestamp :joined_at
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
  end

  identities do
    identity :unique_identity_server, [:identity_id, :server_id]
  end

  @type t :: %__MODULE__{}
end
