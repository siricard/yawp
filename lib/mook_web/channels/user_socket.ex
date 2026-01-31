defmodule MookWeb.UserSocket do
  @moduledoc """
  Phoenix socket entrypoint for the Mook channel handshake.

  Sockets connect unauthenticated. Identity is established via the
  `auth:lobby` channel handshake. Downstream channels
  (`room:<id>`, `call:<peer_did>`) require `socket.assigns.current_did`
  to be set, which only happens after a successful handshake.
  """

  use Phoenix.Socket

  channel "auth:lobby", MookWeb.AuthChannel

  @impl true
  def connect(_params, socket, _connect_info), do: {:ok, socket}

  @impl true
  def id(_socket), do: nil
end
