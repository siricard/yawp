defmodule Yawp.Call.SessionSupervisor do
  @moduledoc """
  DynamicSupervisor for `Yawp.Call.Session` processes.

  Started by `Yawp.Application`. Spawn a session for a new call with
  `start_session/1`.
  """

  use DynamicSupervisor

  alias Yawp.Call.Session

  @spec start_link(keyword()) :: Supervisor.on_start()
  def start_link(opts \\ []) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  @doc """
  Start a `Yawp.Call.Session` under this supervisor for the given pair
  of DIDs.
  """
  @spec start_session(Session.args()) :: DynamicSupervisor.on_start_child()
  def start_session(%{caller_did: _, peer_did: _} = args) do
    DynamicSupervisor.start_child(__MODULE__, {Session, args})
  end
end
