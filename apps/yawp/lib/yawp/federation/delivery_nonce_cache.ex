defmodule Yawp.Federation.DeliveryNonceCache do
  @moduledoc """
  Replay-protection store for federation delivery wrappers.

  Each accepted wrapper carries a unique `delivery_nonce`; recording it
  here lets a recipient anchor reject a re-sent wrapper within the
  24h retention window. Backed by a process-owned `:ets`
  table holding `{nonce, expires_at}` and swept periodically so the
  table stays bounded. A hard `max_entries` ceiling guards against
  unbounded growth between sweeps: once reached, the oldest entries are
  dropped first.
  """

  use GenServer

  @table __MODULE__
  @default_ttl_seconds 86_400
  @sweep_interval_ms :timer.minutes(30)
  @max_entries 1_000_000

  @type nonce :: String.t()

  def default_ttl_seconds, do: @default_ttl_seconds

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @spec record(nonce(), integer()) :: :ok | {:error, :replay}
  def record(nonce, ttl_seconds \\ @default_ttl_seconds) do
    now = System.system_time(:second)
    expires_at = now + ttl_seconds

    case :ets.lookup(@table, nonce) do
      [{^nonce, existing_expiry}] when existing_expiry > now ->
        {:error, :replay}

      _ ->
        :ets.insert(@table, {nonce, expires_at})
        maybe_enforce_ceiling()
        :ok
    end
  end

  @spec seen?(nonce()) :: boolean()
  def seen?(nonce) do
    now = System.system_time(:second)

    case :ets.lookup(@table, nonce) do
      [{^nonce, expires_at}] -> expires_at > now
      [] -> false
    end
  end

  @spec size() :: non_neg_integer()
  def size, do: :ets.info(@table, :size)

  @spec sweep() :: :ok
  def sweep do
    now = System.system_time(:second)
    :ets.select_delete(@table, [{{:_, :"$1"}, [{:"=<", :"$1", now}], [true]}])
    :ok
  end

  @spec clear() :: :ok
  def clear do
    :ets.delete_all_objects(@table)
    :ok
  end

  defp maybe_enforce_ceiling do
    if :ets.info(@table, :size) > @max_entries do
      sweep()

      if :ets.info(@table, :size) > @max_entries do
        :ets.tab2list(@table)
        |> Enum.sort_by(fn {_nonce, expires_at} -> expires_at end)
        |> Enum.take(div(@max_entries, 10))
        |> Enum.each(fn {nonce, _} -> :ets.delete(@table, nonce) end)
      end
    end
  end

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    schedule_sweep()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:sweep, state) do
    sweep()
    schedule_sweep()
    {:noreply, state}
  end

  defp schedule_sweep do
    Process.send_after(self(), :sweep, @sweep_interval_ms)
  end
end
