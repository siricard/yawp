defmodule YawpWeb.UserSocket do
  @moduledoc """
  Phoenix socket entrypoint for the real-time chat surface.

  Authenticated by the opaque session token issued by `bind_device`. The client must connect with
  `{token: "<session_token>"}` socket params; we verify the token via
  `Yawp.Identity.verify_session/1` and stash the resulting identity on
  the socket assigns as `:current_identity`.

  header-only transport, no cookies. The browser passes the
  same session token here that it would on HTTP RPCs.
  """

  use Phoenix.Socket

  channel "server:*", YawpWeb.ServerChannelTopic
  channel "user:*", YawpWeb.UserChannel

  @impl true
  def connect(%{"token" => token}, socket, _connect_info) when is_binary(token) do
    case Yawp.Identity.verify_session(token) do
      {:ok, identity} -> {:ok, assign(socket, :current_identity, identity)}
      _ -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @impl true
  def id(socket) do
    case socket.assigns[:current_identity] do
      %Yawp.Identity.Identity{id: id} -> "identity_socket:#{id}"
      _ -> nil
    end
  end
end
