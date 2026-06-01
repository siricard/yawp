defmodule Yawp.Servers.Kick do
  @moduledoc """
  A kick event on a server (ADR 017).

  Records who kicked whom, an optional reason, and when. Creating a kick
  via the `:kick` action (gated by the `kick_members` permission bit)
  flips the target membership's `kicked` flag and revokes every session
  and refresh token the kicked identity holds, so the client's
  authenticated requests immediately start failing.

  A kick is reversible: the identity can rejoin through a fresh invite.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "server_kicks"
    repo Yawp.Repo

    references do
      reference :server, on_delete: :delete
      reference :identity, on_delete: :delete
      reference :kicked_by_identity, on_delete: :nilify
    end
  end

  typescript do
    type_name "ServerKick"
  end

  actions do
    defaults [:read, :destroy]

    create :kick do
      description """
      Records a kick, flips the target membership's `kicked` flag, and
      revokes all of the kicked identity's session + refresh tokens.
      Gated by the `kick_members` bit; `kicked_by_identity_id` is stamped
      from the Ash actor.
      """

      accept [:reason]

      argument :server_id, :uuid, allow_nil?: false
      argument :identity_id, :uuid, allow_nil?: true
      argument :did, :string, allow_nil?: true

      change Yawp.Servers.Changes.ResolveModerationTarget
      change {Yawp.Servers.Changes.RequireServerPermission, bit: :kick_members}
      change {Yawp.Servers.Changes.ApplyModeration, flag: :kicked}
      change set_attribute(:server_id, arg(:server_id))
      change set_attribute(:identity_id, arg(:identity_id))
    end

    read :list_for_server do
      description "All kick events on the given server, newest first."
      argument :server_id, :uuid, allow_nil?: false
      filter expr(server_id == ^arg(:server_id))
      prepare build(sort: [inserted_at: :desc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :reason, :string do
      allow_nil? true
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

    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? false
      attribute_writable? true
      attribute_type :uuid
      public? true
      source_attribute :identity_id
    end

    belongs_to :kicked_by_identity, Yawp.Identity.Identity do
      allow_nil? true
      attribute_writable? false
      attribute_type :uuid
      public? true
      source_attribute :kicked_by_identity_id
    end
  end

  @type t :: %__MODULE__{}
end
