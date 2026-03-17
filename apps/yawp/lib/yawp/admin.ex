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
  end
end
