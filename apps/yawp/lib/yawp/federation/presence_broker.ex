defmodule Yawp.Federation.PresenceBroker do
  @moduledoc false

  use GenServer

  alias Yawp.Federation.Client

  @default_idle_after_ms 300_000

  @type state_atom :: :online | :idle | :offline

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @spec subscribe(GenServer.server(), String.t(), String.t()) :: :ok
  def subscribe(server \\ __MODULE__, did, peer_host)
      when is_binary(did) and is_binary(peer_host) do
    GenServer.call(server, {:subscribe, did, peer_host})
  end

  @spec subscribe_peers(GenServer.server(), String.t(), [String.t()]) :: :ok
  def subscribe_peers(server \\ __MODULE__, did, peers)
      when is_binary(did) and is_list(peers) do
    for peer <- peers, is_binary(peer) and peer != "" do
      subscribe(server, did, peer)
    end

    :ok
  end

  @spec unsubscribe(GenServer.server(), String.t(), String.t()) :: :ok
  def unsubscribe(server \\ __MODULE__, did, peer_host)
      when is_binary(did) and is_binary(peer_host) do
    GenServer.call(server, {:unsubscribe, did, peer_host})
  end

  @impl true
  def init(opts) do
    state = %{
      notifier: Keyword.get(opts, :notifier, &default_notifier/3),
      idle_after_ms: Keyword.get_lazy(opts, :idle_after_ms, &configured_idle_after_ms/0),
      subscriptions: %{},
      bare_to_did: %{},
      presence: %{},
      idle_timers: %{}
    }

    {:ok, state}
  end

  @impl true
  def handle_call({:subscribe, did, peer_host}, _from, state) do
    bare = bare(did)
    already_watching? = Map.has_key?(state.subscriptions, did)

    unless already_watching? do
      Phoenix.PubSub.subscribe(Yawp.PubSub, presence_topic(bare))
    end

    peers = state.subscriptions |> Map.get(did, MapSet.new()) |> MapSet.put(peer_host)

    current = current_presence(bare)

    state =
      state
      |> put_in([:subscriptions, did], peers)
      |> put_in([:bare_to_did, bare], did)
      |> put_in([:presence, did], current)

    push(state, did, peer_host, current)
    state = arm_idle_timer(state, did, current)

    {:reply, :ok, state}
  end

  @impl true
  def handle_call({:unsubscribe, did, peer_host}, _from, state) do
    peers = state.subscriptions |> Map.get(did, MapSet.new()) |> MapSet.delete(peer_host)

    state =
      if MapSet.size(peers) == 0 do
        Phoenix.PubSub.unsubscribe(Yawp.PubSub, presence_topic(bare(did)))

        state
        |> update_in([:subscriptions], &Map.delete(&1, did))
        |> update_in([:bare_to_did], &Map.delete(&1, bare(did)))
        |> update_in([:presence], &Map.delete(&1, did))
        |> cancel_idle_timer(did)
      else
        put_in(state, [:subscriptions, did], peers)
      end

    {:reply, :ok, state}
  end

  @impl true
  def handle_info(
        %Phoenix.Socket.Broadcast{topic: "user:" <> bare, event: "presence_diff"},
        state
      ) do
    case Map.get(state.bare_to_did, bare) do
      nil ->
        {:noreply, state}

      did ->
        {:noreply, recompute(state, did, bare)}
    end
  end

  @impl true
  def handle_info({:idle, did}, state) do
    if Map.get(state.presence, did) == :online do
      state =
        state
        |> put_in([:presence, did], :idle)
        |> cancel_idle_timer(did)

      broadcast(state, did, :idle)
      {:noreply, state}
    else
      {:noreply, cancel_idle_timer(state, did)}
    end
  end

  @impl true
  def handle_info(_msg, state), do: {:noreply, state}

  defp recompute(state, did, bare) do
    previous = Map.get(state.presence, did, :offline)
    current = current_presence(bare)

    cond do
      current == :online ->
        state = put_in(state, [:presence, did], :online)
        if previous != :online, do: broadcast(state, did, :online)
        arm_idle_timer(state, did, :online)

      current == :offline and previous != :offline ->
        state =
          state
          |> put_in([:presence, did], :offline)
          |> cancel_idle_timer(did)

        broadcast(state, did, :offline)
        state

      true ->
        state
    end
  end

  defp arm_idle_timer(state, did, :online) do
    state = cancel_idle_timer(state, did)
    ref = Process.send_after(self(), {:idle, did}, state.idle_after_ms)
    put_in(state, [:idle_timers, did], ref)
  end

  defp arm_idle_timer(state, _did, _other), do: state

  defp cancel_idle_timer(state, did) do
    case Map.get(state.idle_timers, did) do
      nil ->
        state

      ref ->
        Process.cancel_timer(ref)
        update_in(state, [:idle_timers], &Map.delete(&1, did))
    end
  end

  defp broadcast(state, did, presence_state) do
    for peer <- Map.get(state.subscriptions, did, MapSet.new()) do
      push(state, did, peer, presence_state)
    end

    :ok
  end

  defp push(state, did, peer_host, presence_state) do
    state.notifier.(peer_host, did, presence_state)
  rescue
    _ -> :ok
  catch
    _, _ -> :ok
  end

  defp current_presence(bare) do
    if presence_list(bare) == %{}, do: :offline, else: :online
  end

  defp presence_list(bare) do
    YawpWeb.Presence.list(presence_topic(bare))
  rescue
    _ -> %{}
  end

  defp presence_topic(bare), do: "user:#{bare}"

  defp bare("did:yawp:" <> base58), do: base58
  defp bare(other) when is_binary(other), do: other

  defp default_notifier(peer_host, did, presence_state) do
    Client.notify_presence!(peer_host, %{"did" => did, "state" => to_string(presence_state)})
    :ok
  end

  defp configured_idle_after_ms do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get(:idle_after_ms, @default_idle_after_ms)
  end
end
