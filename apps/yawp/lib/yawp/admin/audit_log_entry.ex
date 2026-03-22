defmodule Yawp.Admin.AuditLogEntry do
  @moduledoc """
  Operator audit-log row.

  Captures every operator-visible event — login success/failure,
  logout, claim-token generate/revoke, and any settings
  change made from the `/admin` LiveView — for later forensic
  review. The `/admin` dashboard's audit-log section renders the 50
  most-recent entries newest-first via a LiveView stream.

  `account_id` is nullable so login failures (which have no
  authenticated account) can still be recorded.

  Callers reach this resource through `Yawp.Admin.audit!/3` and
  `Yawp.Admin.list_recent_audit_entries/0`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Admin,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "admin_audit_log_entries"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :create do
      primary? true
      accept [:account_id, :action, :payload]
    end

    read :list_recent do
      description "50 most-recent audit entries, newest first."
      prepare build(sort: [inserted_at: :desc], limit: 50)
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :account_id, :uuid do
      allow_nil? true
      public? true
    end

    attribute :action, :string do
      allow_nil? false
      public? true
    end

    attribute :payload, :map do
      allow_nil? false
      default %{}
      public? true
    end

    create_timestamp :inserted_at
  end

  @type t :: %__MODULE__{}
end
