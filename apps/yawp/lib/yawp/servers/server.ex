defmodule Yawp.Servers.Server do
  @moduledoc """
  The singleton server row representing this anchor.

  Carries the server name, an optional description, and the `owner_did`
  of the single server owner who holds unconditional authority over the
  server (set when the operator claims the anchor).
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
      accept [:name, :description]
    end

    update :set_owner do
      description "Records the DID of the server owner."
      accept [:owner_did]
    end

    update :set_body_archive do
      description "Toggles whether deletes archive the original body to the admin-only store."
      accept [:body_archive_enabled]
    end

    update :set_retention_default do
      accept [:retention, :retention_duration_ms]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
    end

    attribute :description, :string do
      allow_nil? true
      public? true
    end

    attribute :owner_did, :string do
      allow_nil? true
      public? true
      description "DID of the single server owner (ADR 017). Nil until claimed."
    end

    attribute :body_archive_enabled, :boolean do
      allow_nil? false
      default false
      public? true

      description """
      When on, deleting a message archives the original body to the
      admin-only store rather than discarding it. Off by default.
      """
    end

    attribute :retention, :atom do
      allow_nil? false
      default :forever
      public? true
      constraints one_of: [:forever, :duration_ms]
    end

    attribute :retention_duration_ms, :integer do
      allow_nil? true
      public? true
      constraints min: 1
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  @type t :: %__MODULE__{}
end
