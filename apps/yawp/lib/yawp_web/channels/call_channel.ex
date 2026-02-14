defmodule YawpWeb.CallChannel do
  @moduledoc """
  Phoenix channel for 1:1 WebRTC signaling — topic `call:<peer_did>`.

  ## Topic convention (M5)

  The topic suffix is the **CALLEE's** DID. The caller joins
  `call:<bob_did>` to ring Bob; Bob's client also joins `call:<bob_did>`
  (since the receiver listens on their own topic). All signaling
  messages (`offer`, `answer`, `ice`) are relayed via Phoenix broadcasts
  on that topic so both peers see each other.

   policy explicitly allows ringing yourself — useful for the
  single-user dev loop. Do not over-restrict.

  ## Authorization

  Join requires `socket.assigns.current_did` to be set. This assign is
  established at the SOCKET level by `YawpWeb.UserSocket.connect/3` when
  the client presents a valid Phoenix.Token obtained from the
  `auth:lobby` handshake. If `current_did` is absent (anonymous
  connect), the join is refused with `{:error, %{reason: :unauthorized}}`.

  ## Events

  | Direction | Event | Payload | Reply / Broadcast |
  |-----------|---------|--------------------------|-------------------|
  | in/out | `offer` | RTCSessionDescription | broadcast `offer` with `{from, payload}` |
  | in/out | `answer`| RTCSessionDescription | broadcast `answer` with `{from, payload}` |
  | in/out | `ice` | RTCIceCandidateInit | broadcast `ice` with `{from, payload}` |
  | in/out | `bye` | (empty map) | broadcast `bye` with `{from}` |

  Each broadcast carries `from: socket.assigns.current_did` so peers can
  tell whose candidate / offer they received without trusting the
  client-side payload.

  `bye` is a hang-up signal so the remote peer can tear down its
  `RTCPeerConnection` deterministically without relying on ICE consent
  freshness timing out. The leaving client emits `bye` and then leaves
  the channel.
  """

  use YawpWeb, :channel

  @impl true
  def join("call:" <> peer_did, _params, socket) do
    case Map.fetch(socket.assigns, :current_did) do
      {:ok, did} when is_binary(did) ->
        socket =
          socket
          |> assign(:peer_did, peer_did)

        {:ok, %{peer_did: peer_did, current_did: did}, socket}

      _ ->
        {:error, %{reason: :unauthorized}}
    end
  end

  @impl true
  def handle_in(event, payload, socket) when event in ["offer", "answer", "ice"] do
    case payload do
      payload when is_map(payload) ->
        broadcast!(socket, event, %{
          from: socket.assigns.current_did,
          payload: payload
        })

        {:reply, :ok, socket}

      _ ->
        {:reply, {:error, %{reason: :invalid_payload}}, socket}
    end
  end

  def handle_in("bye", _payload, socket) do
    broadcast!(socket, "bye", %{from: socket.assigns.current_did})
    {:reply, :ok, socket}
  end
end
