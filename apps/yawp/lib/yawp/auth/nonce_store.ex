defmodule Yawp.Auth.NonceStore do
  @moduledoc """
  Single-use, time-limited nonces for the auth channel challenge-response.

  Backed by a named, public ETS table (`#{__MODULE__}`) owned by this
  GenServer. Each entry is `{nonce, expires_at_monotonic_ms}`. `issue/0`
  generates a fresh 32-byte random nonce; `consume/1` atomically removes
  it and returns:

    * `{:ok, nonce}` — the nonce was valid and is now spent.
    * `{:error, :nonce_consumed}` — the nonce is unknown (never issued, or
      already consumed). From the client's perspective these are
      indistinguishable, and that's the point.
    * `{:error, :nonce_expired}` — the nonce existed but its TTL had
      lapsed.

  A periodic sweep removes expired entries so the table doesn't grow
  unbounded under sustained churn.

  TTL is 60s per `docs/`.
  """

  use GenServer

  @table __MODULE__
  @ttl_ms 60_000
  @nonce_bytes 32
  @sweep_interval_ms 10_000

  
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Generate a fresh 32-byte nonce and store it with a 60s TTL.

  Returns `{:ok, %{nonce: <<32 bytes>>, ttl_ms: 60_000}}`.
  """
  @spec issue() :: {:ok, %{nonce: binary(), ttl_ms: non_neg_integer()}}
  def issue do
    nonce = :crypto.strong_rand_bytes(@nonce_bytes)
    expires_at = System.monotonic_time(:millisecond) + @ttl_ms
    true = :ets.insert_new(@table, {nonce, expires_at})
    {:ok, %{nonce: nonce, ttl_ms: @ttl_ms}}
  end

  @doc """
  Single-use consumption of a nonce. Atomic via `:ets.take/2`.
  """
  @spec consume(binary()) ::
          {:ok, binary()} | {:error, :nonce_consumed | :nonce_expired}
  def consume(nonce) when is_binary(nonce) do
    case :ets.take(@table, nonce) do
      [] ->
        {:error, :nonce_consumed}

      [{^nonce, expires_at}] ->
        if System.monotonic_time(:millisecond) <= expires_at do
          {:ok, nonce}
        else
          {:error, :nonce_expired}
        end
    end
  end

  @doc false
  def ttl_ms, do: @ttl_ms

  
  @impl true
  def init(_opts) do
    :ets.new(@table, [
      :named_table,
      :set,
      :public,
      read_concurrency: true,
      write_concurrency: true
    ])

    schedule_sweep()
    {:ok, %{}}
  end

  @impl true
  def handle_info(:sweep, state) do
    now = System.monotonic_time(:millisecond)
        :ets.select_delete(@table, [
      {{:"$1", :"$2"}, [{:<, :"$2", now}], [true]}
    ])

    schedule_sweep()
    {:noreply, state}
  end

  defp schedule_sweep do
    Process.send_after(self(), :sweep, @sweep_interval_ms)
  end
end
