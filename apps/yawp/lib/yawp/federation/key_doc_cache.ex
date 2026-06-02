defmodule Yawp.Federation.KeyDocCache do
  @moduledoc """
  Process-owned `:ets` cache of peer anchors' server-key documents,
  keyed by anchor host. Each entry holds `{key_doc, fetched_at, ttl_seconds}`.

  A peer's key document (published at `/.well-known/yawp/server-key.json`)
  is cached for a default of 24h. `get/1` reports `:miss` for an unknown
  host and `:stale` once an entry has lived past its TTL, leaving the
  refetch decision to the caller.
  """

  use GenServer

  @table __MODULE__
  @default_ttl_seconds 86_400

  @type host :: String.t()
  @type key_doc :: map()
  @type entry :: {key_doc(), integer(), non_neg_integer()}

  def default_ttl_seconds, do: @default_ttl_seconds

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @spec get(host()) :: {:ok, entry()} | :miss | :stale
  def get(host) do
    case :ets.lookup(@table, host) do
      [{^host, {_doc, fetched_at, ttl} = entry}] ->
        if fresh?(fetched_at, ttl), do: {:ok, entry}, else: :stale

      [] ->
        :miss
    end
  end

  @spec put(host(), key_doc(), non_neg_integer()) :: :ok
  def put(host, key_doc, ttl_seconds \\ @default_ttl_seconds) do
    :ets.insert(@table, {host, {key_doc, System.system_time(:second), ttl_seconds}})
    :ok
  end

  @spec delete(host()) :: :ok
  def delete(host) do
    :ets.delete(@table, host)
    :ok
  end

  @spec clear() :: :ok
  def clear do
    :ets.delete_all_objects(@table)
    :ok
  end

  defp fresh?(fetched_at, ttl_seconds) do
    System.system_time(:second) < fetched_at + ttl_seconds
  end

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :public, :set, read_concurrency: true])
    {:ok, %{}}
  end
end
