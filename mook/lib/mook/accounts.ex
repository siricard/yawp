defmodule Mook.Accounts do
  use Ash.Domain, otp_app: :mook, extensions: [AshAdmin.Domain]

  admin do
    show? true
  end

  resources do
    resource Mook.Accounts.Token
    resource Mook.Accounts.User
  end
end
