defmodule Yawp.Admin do
  @moduledoc """
  The operator/admin domain — accounts that hold a password (or passkey
  in a later milestone), claim tokens, audit log, and per-server
  settings. See `docs/` for the
  operator-vs-chat-owner split.

   only hosts the renamed `Yawp.Admin.Account` (formerly
  `Yawp.Accounts.User`) and `Yawp.Admin.Token` (formerly
  `Yawp.Accounts.Token`). Claim tokens and the audit log resource land in
  .
  """

  use Ash.Domain, otp_app: :yawp, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Yawp.Admin.Account do
      rpc_action :register_with_pubkey, :register_with_pubkey
    end
  end

  resources do
    resource Yawp.Admin.Token
    resource Yawp.Admin.Account
  end
end
