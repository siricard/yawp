defmodule Mook.Chat do
  use Ash.Domain, otp_app: :mook, extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Mook.Chat.Message

    resource Mook.Chat.Room do
      rpc_action :list_rooms, :read
      rpc_action :create_room, :create
      rpc_action :join_room, :join
    end
  end

  resources do
    resource Mook.Chat.Room
    resource Mook.Chat.Message
  end
end
