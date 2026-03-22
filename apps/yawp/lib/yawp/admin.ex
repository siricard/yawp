defmodule Yawp.Admin do
  @moduledoc """
  The operator/admin domain — accounts that hold a password (or passkey
  in a later milestone), claim tokens, audit log, and per-server
  settings. See `docs/` for the
  operator-vs-chat-owner split.

   only hosts the renamed `Yawp.Admin.Account` and `Yawp.Admin.Token`
  (renamed from the legacy Accounts namespace). Claim tokens and the audit
  log resource land .
  """

  use Ash.Domain, otp_app: :yawp, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Yawp.Admin.Account
  end

  resources do
    resource Yawp.Admin.Token

    resource Yawp.Admin.Account do
      define :create_account, action: :create_account
      define :touch_last_login, action: :touch_last_login
      define :get_admin_account_by_email, action: :get_by_email, args: [:email]
    end

    resource Yawp.Admin.AuditLogEntry do
      define :create_audit_entry, action: :create
      define :list_recent_audit_entries, action: :list_recent
    end
  end

  @doc """
  Records an operator audit-log event.

  `account_id` may be `nil` when the action has no authenticated
  operator (e.g. a failed login attempt). `payload` is stored as
  JSONB and round-trips through Postgres with string keys.

  Raises if the insert fails — audit events must be recorded.
  """
  @spec audit!(binary() | nil, String.t(), map()) :: Yawp.Admin.AuditLogEntry.t()
  def audit!(account_id, action, payload \\ %{})
      when (is_binary(account_id) or is_nil(account_id)) and is_binary(action) and is_map(payload) do
    create_audit_entry!(%{account_id: account_id, action: action, payload: payload},
      authorize?: false
    )
  end
end
