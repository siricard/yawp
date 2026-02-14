defmodule Yawp.Accounts do
  use Ash.Domain, otp_app: :yawp, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Yawp.Accounts.User do
      rpc_action :register_with_pubkey, :register_with_pubkey
    end
  end

  resources do
    resource Yawp.Accounts.Token
    resource Yawp.Accounts.User
  end
end
