defmodule Mook.Chat do
  use Ash.Domain, otp_app: :mook, extensions: [AshTypescript.Rpc]

  typescript_rpc do
            resource Mook.Chat.Message
  end

  resources do
    resource Mook.Chat.Room
    resource Mook.Chat.Message
  end
end
