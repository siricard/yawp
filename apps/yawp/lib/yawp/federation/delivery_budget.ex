defmodule Yawp.Federation.DeliveryBudget do
  @moduledoc false

  use GenServer

  @table __MODULE__
  @base_capacity 100
  @capacity_step 10
  @max_capacity 10_000
  @minute_ms 60_000
  @day_ms 86_400_000

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def consume(peer_anchor, opts \\ []) when is_binary(peer_anchor) do
    now_ms = Keyword.get_lazy(opts, :now_ms, &now_ms/0)
    GenServer.call(__MODULE__, {:consume, peer_anchor, now_ms})
  end

  def record_accepted(peer_anchor, opts \\ []) when is_binary(peer_anchor) do
    now_ms = Keyword.get_lazy(opts, :now_ms, &now_ms/0)
    GenServer.call(__MODULE__, {:record_accepted, peer_anchor, now_ms})
  end

  def capacity_for(peer_anchor, opts \\ []) when is_binary(peer_anchor) do
    now_ms = Keyword.get_lazy(opts, :now_ms, &now_ms/0)

    case :ets.lookup(@table, peer_anchor) do
      [{^peer_anchor, _tokens, _last_refill_ms, first_accepted_ms, accepted_count}] ->
        capacity(first_accepted_ms, accepted_count, now_ms)

      [] ->
        @base_capacity
    end
  end

  def clear do
    :ets.delete_all_objects(@table)
    :ok
  end

  @impl true
  def init(_opts) do
    :ets.new(@table, [:named_table, :public, read_concurrency: true, write_concurrency: true])
    {:ok, %{}}
  end

  @impl true
  def handle_call({:consume, peer_anchor, now_ms}, _from, state) do
    case :ets.lookup(@table, peer_anchor) do
      [{^peer_anchor, tokens, last_refill_ms, first_accepted_ms, accepted_count}] ->
        capacity = capacity(first_accepted_ms, accepted_count, now_ms)
        tokens = refill(tokens, last_refill_ms, now_ms, capacity)

        if tokens >= 1 do
          :ets.insert(
            @table,
            {peer_anchor, tokens - 1, now_ms, first_accepted_ms, accepted_count}
          )

          {:reply, :ok, state}
        else
          retry_after = retry_after_seconds(tokens, capacity)
          {:reply, {:error, {:rate_limited, retry_after}}, state}
        end

      [] ->
        :ets.insert(@table, {peer_anchor, @base_capacity - 1, now_ms, nil, 0})
        {:reply, :ok, state}
    end
  end

  @impl true
  def handle_call({:record_accepted, peer_anchor, now_ms}, _from, state) do
    case :ets.lookup(@table, peer_anchor) do
      [{^peer_anchor, tokens, last_refill_ms, nil, accepted_count}] ->
        :ets.insert(@table, {peer_anchor, tokens, last_refill_ms, now_ms, accepted_count + 1})

      [{^peer_anchor, tokens, last_refill_ms, first_accepted_ms, accepted_count}] ->
        :ets.insert(
          @table,
          {peer_anchor, tokens, last_refill_ms, first_accepted_ms, accepted_count + 1}
        )

      [] ->
        :ets.insert(@table, {peer_anchor, @base_capacity, now_ms, now_ms, 1})
    end

    {:reply, :ok, state}
  end

  defp refill(tokens, last_refill_ms, now_ms, capacity) do
    elapsed_ms = max(0, now_ms - last_refill_ms)
    min(capacity, tokens + elapsed_ms * capacity / @minute_ms)
  end

  defp retry_after_seconds(tokens, capacity) do
    depleted_tokens = 1 - tokens
    ms_until_next_token = Kernel./(Kernel.*(depleted_tokens, @minute_ms), capacity)
    max(1, ceil(Kernel./(ms_until_next_token, 1_000)))
  end

  defp capacity(nil, _accepted_count, _now_ms), do: @base_capacity

  defp capacity(first_accepted_ms, accepted_count, now_ms) do
    earned_days = div(max(0, now_ms - first_accepted_ms), @day_ms)

    if accepted_count > 0 do
      min(@max_capacity, @base_capacity + earned_days * @capacity_step)
    else
      @base_capacity
    end
  end

  defp now_ms do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get_lazy(:now_ms, &system_ms/0)
  end

  defp system_ms, do: System.system_time(:millisecond)
end
