defmodule Yawp.Chat do
  use Ash.Domain, otp_app: :yawp, extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Yawp.Chat.Message

    resource Yawp.Chat.Room do
      rpc_action :list_rooms, :read
      rpc_action :create_room, :create
      rpc_action :join_room, :join
    end
  end

  resources do
    resource Yawp.Chat.Room
    resource Yawp.Chat.Message
  end
end
