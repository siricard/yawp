defmodule Yawp.Channels do
  @moduledoc """
  Ash domain for channel messages.

   tracer scope: ONE resource — `Yawp.Channels.Message` — with a
  signature-verified `:send` create action and a `:list_recent` read
  action returning the 50 newest messages on a channel ordered ASC by
  `server_inserted_at`.

  Edits / deletes / attachments / replies / reactions / RBAC beyond
  "has any membership on the server" are deliberately out of scope and
  land .
  """

  use Ash.Domain, otp_app: :yawp

  resources do
    resource Yawp.Channels.Message do
      define :send_message, action: :send
      define :list_recent_messages, action: :list_recent, args: [:channel_id]
    end
  end
end
