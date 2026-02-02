defmodule Mook.Chat do
  use Ash.Domain, otp_app: :mook

  resources do
    resource Mook.Chat.Room
  end
end
