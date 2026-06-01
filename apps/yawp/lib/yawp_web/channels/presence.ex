defmodule YawpWeb.Presence do
  @moduledoc """
  Phoenix Presence tracker for the per-channel online indicator.

  Each `YawpWeb.ServerChannelTopic` join tracks the connecting identity
  under its bare base58 DID so every subscriber on the channel topic sees
  the live roster of who is currently connected to that room.
  """

  use Phoenix.Presence,
    otp_app: :yawp,
    pubsub_server: Yawp.PubSub
end
