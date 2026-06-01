defmodule Yawp.Servers.ArchivedMessageBody do
  @moduledoc """
  Admin-only archive of a deleted message's original body.

  Written only when the server's `body_archive_enabled` flag is on. The
  channel timeline still shows the slot as deleted; the archived body is
  retrievable solely by an identity holding `manage_messages` on the
  owning server, via the message-scoped `list_for_message` read. Off by
  default.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer]

  postgres do
    table "server_archived_message_bodies"
    repo Yawp.Repo

    references do
      reference :message, on_delete: :delete
    end
  end

  actions do
    defaults [:read]

    create :create do
      primary? true
      accept [:message_id, :body]
    end

    read :list_for_message do
      description "Archived bodies for a message, readable only by manage_messages holders."
      argument :message_id, :uuid, allow_nil?: false

      filter expr(message_id == ^arg(:message_id))
      prepare build(sort: [inserted_at: :asc])
    end
  end

  policies do
    policy action_type(:read) do
      access_type :strict
      authorize_if Yawp.Servers.ArchivedMessageBody.Checks.ActorCanManageMessages
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :body, :string do
      allow_nil? false
      public? true
      description "The original message body, retained for privileged review."
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :message, Yawp.Servers.Message do
      allow_nil? false
      attribute_writable? true
      public? true
    end
  end

  @type t :: %__MODULE__{}
end
