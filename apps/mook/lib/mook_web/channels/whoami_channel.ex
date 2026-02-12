defmodule MookWeb.WhoamiChannel do
  @moduledoc """
  Tiny `whoami` channel used by clients to confirm — at the SOCKET level —
  that the token presented to `MookWeb.UserSocket.connect/3` was valid
  and that `socket.assigns.current_did` was set.

  Background: `UserSocket.connect/3` deliberately accepts unauthenticated
  connects (so the `auth:lobby` handshake can run on top), which means an
  invalid or expired token silently falls through to an anonymous socket.
  A client that previously authenticated cannot tell, from the socket
  itself, whether its persisted Phoenix.Token is still good — it only
  finds out when it tries to join a downstream channel like `room:*` and
  gets `{:error, %{reason: :unauthorized}}` with no context about why.

  This channel closes that gap. After connecting with `params: {token}`,
  the client joins `whoami`:

    * If `current_did` is assigned on the socket (valid token):
      `{:ok, %{did: did}}` — client transitions to `authenticated`.

    * Otherwise (no token, garbage token, or expired token):
      `{:error, %{reason: :unauthenticated}}` — client clears the stale
      token from local storage and re-runs the full `auth:lobby`
      nonce/signature handshake.

  The reply is the *only* effect; no broadcasts and no message handlers.

  See:
    * `lib/mook_web/channels/user_socket.ex` for the token verification.
    * `assets/app/auth/useAuthenticatedSocket.ts` for the client side of
      the reauth flow.
  """

  use MookWeb, :channel

  @impl true
  def join("whoami", _params, socket) do
    case Map.fetch(socket.assigns, :current_did) do
      {:ok, did} when is_binary(did) ->
        {:ok, %{did: did}, socket}

      _ ->
        {:error, %{reason: :unauthenticated}}
    end
  end
end
