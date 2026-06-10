defmodule Yawp.Servers.Attachment do
  @moduledoc false

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_attachments"
    repo Yawp.Repo
  end

  actions do
    defaults [:read, :destroy]

    create :record_upload do
      accept [
        :upload_id,
        :content_hash,
        :mime,
        :size_bytes,
        :backend,
        :backend_ref,
        :uploaded_by_did
      ]

      change set_attribute(:uploaded_at, &DateTime.utc_now/0)
    end

    read :get_by_upload_id do
      argument :upload_id, :string, allow_nil?: false
      filter expr(upload_id == ^arg(:upload_id))
      get? true
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :upload_id, :string do
      allow_nil? false
      public? true
    end

    attribute :content_hash, :string do
      allow_nil? false
      public? true
      constraints match: ~r/^[0-9a-f]{64}$/
    end

    attribute :mime, :string do
      allow_nil? false
      public? true
    end

    attribute :size_bytes, :integer do
      allow_nil? false
      public? true
      constraints min: 0
    end

    attribute :backend, :atom do
      allow_nil? false
      public? true
      constraints one_of: [:local, :s3]
    end

    attribute :backend_ref, :string do
      allow_nil? false
      public? true
    end

    attribute :uploaded_by_did, :string do
      allow_nil? true
      public? true
    end

    attribute :uploaded_at, :utc_datetime_usec do
      allow_nil? false
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_upload_id, [:upload_id]
  end

  @type t :: %__MODULE__{}
end
