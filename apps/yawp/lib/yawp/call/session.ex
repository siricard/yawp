defmodule Yawp.Call.Session do
  @moduledoc """
  Minimal per-call session holder.

  For , the WebRTC media plane is browser-driven: each peer's
  `RTCPeerConnection` lives in the browser and exchanges SDP + ICE
  candidates over the `call:<peer_did>` Phoenix Channel.
  This GenServer is therefore a placeholder that tracks the two DIDs
  involved in a call so the server has a process to attach to once
   introduces server-side media (e.g. SFU bridging or recording).

  It is started under `Yawp.Call.SessionSupervisor`, a DynamicSupervisor
  registered in `Yawp.Application`. See `docs/`
  for the rationale on STUN-only / TURN-deferred networking.
  """

  use GenServer

  @typedoc "DID identifier (base58-encoded SHA-256 of a public key)."
  @type did :: String.t()

  @typedoc "Arguments accepted by `start_link/1`."
  @type args :: %{
          required(:caller_did) => did(),
          required(:peer_did) => did()
        }

  
  @spec start_link(args()) :: GenServer.on_start()
  def start_link(%{caller_did: _, peer_did: _} = args) do
    GenServer.start_link(__MODULE__, args)
  end

  @doc """
  Return the session's tracked DIDs.
  """
  @spec get_state(pid()) :: %{caller_did: did(), peer_did: did()}
  def get_state(pid) do
    GenServer.call(pid, :get_state)
  end

  
  @impl true
  def init(%{caller_did: caller_did, peer_did: peer_did}) do
    {:ok, %{caller_did: caller_did, peer_did: peer_did}}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, state, state}
  end
end
