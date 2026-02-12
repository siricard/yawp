defmodule Mook.Accounts do
  use Ash.Domain, otp_app: :mook, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Mook.Accounts.User do
      rpc_action :register_with_pubkey, :register_with_pubkey
    end
  end

  resources do
    resource Mook.Accounts.Token
    resource Mook.Accounts.User
  end
end
