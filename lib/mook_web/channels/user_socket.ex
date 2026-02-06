defmodule MookWeb.UserSocket do
  @moduledoc """
  Phoenix socket entrypoint for the Mook channel handshake.

  Two connect modes:

    * **No token** — the socket connects unauthenticated. The client uses
      `auth:lobby` to perform the challenge-response handshake. On
      success the server returns `%{did, token}` in the reply.

    * **`token` connect param** — the client reconnects presenting the
      Phoenix.Token obtained from a previous successful handshake. The
      token is verified here and, on success, `:current_did` is assigned
      **at the socket level**. Phoenix propagates socket assigns into
      every channel joined over that socket, so downstream channels
      (`room:<id>` in M4, `call:<peer_did>` in M5) can rely on
      `socket.assigns.current_did`.

  An invalid or expired token does not abort the connect — the socket
  is simply not authenticated. The client can recover by reopening
  `auth:lobby` and redoing the handshake.

  See `docs/` §"Session continuation after
  auth" for the full flow.
  """

  use Phoenix.Socket

      @token_salt "user_did"
    @token_max_age 86_400

  @doc "Token namespace shared between `AuthChannel` and `UserSocket`."
  def token_salt, do: @token_salt

  @doc "Token TTL (seconds) shared between `AuthChannel` and `UserSocket`."
  def token_max_age, do: @token_max_age

  channel "auth:lobby", MookWeb.AuthChannel
  channel "whoami", MookWeb.WhoamiChannel
  channel "room:*", MookWeb.RoomChannel

  @impl true
  def connect(params, socket, _connect_info) do
    case params do
      %{"token" => token} when is_binary(token) ->
        case Phoenix.Token.verify(MookWeb.Endpoint, @token_salt, token, max_age: @token_max_age) do
          {:ok, did} when is_binary(did) ->
            {:ok, Phoenix.Socket.assign(socket, :current_did, did)}

          _ ->
                                    {:ok, socket}
        end

      _ ->
        {:ok, socket}
    end
  end

  @impl true
  def id(_socket), do: nil
end
