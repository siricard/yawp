defmodule Yawp.Federation.RemotePresence do
  @moduledoc false

  use GenServer

  require Ash.Query

  alias Yawp.Servers
  alias YawpWeb.Presence

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @spec apply(GenServer.server(), String.t(), String.t()) :: :ok
  def apply(server \\ __MODULE__, did, state)
      when is_binary(did) and state in ["online", "idle", "offline"] do
    GenServer.call(server, {:apply, did, state})
  end

  @impl true
  def init(_opts), do: {:ok, %{}}

  @impl true
  def handle_call({:apply, did, "offline"}, _from, state) do
    bare = bare(did)

    for topic <- guest_channel_topics(did) do
      Presence.untrack(self(), topic, bare)
    end

    {:reply, :ok, state}
  end

  @impl true
  def handle_call({:apply, did, presence_state}, _from, state) do
    bare = bare(did)
    meta = %{state: presence_state, online_at: System.system_time(:second)}

    for topic <- guest_channel_topics(did) do
      case Presence.update(self(), topic, bare, meta) do
        {:ok, _} -> :ok
        {:error, _} -> Presence.track(self(), topic, bare, meta)
      end
    end

    {:reply, :ok, state}
  end

  defp guest_channel_topics(did) do
    case server_ids_for_guest(did) do
      [] ->
        []

      server_ids ->
        Servers.Channel
        |> Ash.Query.filter(server_id in ^server_ids and type == :text)
        |> Ash.read!(authorize?: false)
        |> Enum.map(fn channel -> "server:#{channel.server_id}:channel:#{channel.id}" end)
    end
  end

  defp server_ids_for_guest(did) do
    case Yawp.Identity.get_identity_by_did(did) do
      {:ok, identity} ->
        Servers.Membership
        |> Ash.Query.filter(identity_id == ^identity.id and kind == :guest)
        |> Ash.read!(authorize?: false)
        |> Enum.map(& &1.server_id)

      _ ->
        []
    end
  end

  defp bare("did:yawp:" <> base58), do: base58
  defp bare(other) when is_binary(other), do: other
end
