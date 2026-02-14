defmodule Yawp.Auth.NonceStoreTest do
  use ExUnit.Case, async: false

  alias Yawp.Auth.NonceStore

  @table Yawp.Auth.NonceStore

  describe "issue/0" do
    test "returns a 32-byte nonce and the configured TTL" do
      assert {:ok, %{nonce: nonce, ttl_ms: ttl_ms}} = NonceStore.issue()

      assert is_binary(nonce)
      assert byte_size(nonce) == 32
      assert ttl_ms == 60_000
    end

    test "issues unique nonces" do
      nonces =
        for _ <- 1..100 do
          {:ok, %{nonce: n}} = NonceStore.issue()
          n
        end

      assert length(Enum.uniq(nonces)) == length(nonces)
    end
  end

  describe "consume/1" do
    test "returns {:ok, nonce} on first consume" do
      {:ok, %{nonce: nonce}} = NonceStore.issue()
      assert {:ok, ^nonce} = NonceStore.consume(nonce)
    end

    test "returns {:error, :nonce_consumed} on second consume (replay)" do
      {:ok, %{nonce: nonce}} = NonceStore.issue()
      assert {:ok, ^nonce} = NonceStore.consume(nonce)
      assert {:error, :nonce_consumed} = NonceStore.consume(nonce)
    end

    test "returns {:error, :nonce_consumed} for never-issued nonce" do
      bogus = :crypto.strong_rand_bytes(32)
      assert {:error, :nonce_consumed} = NonceStore.consume(bogus)
    end

    test "returns {:error, :nonce_expired} once TTL has elapsed (time advance)" do
      {:ok, %{nonce: nonce}} = NonceStore.issue()

                  past = System.monotonic_time(:millisecond) - 1
      assert :ets.update_element(@table, nonce, {2, past}) == true

      assert {:error, :nonce_expired} = NonceStore.consume(nonce)
    end

    test "an expired nonce is removed (cannot be consumed again as expired)" do
      {:ok, %{nonce: nonce}} = NonceStore.issue()
      past = System.monotonic_time(:millisecond) - 1
      :ets.update_element(@table, nonce, {2, past})

      assert {:error, :nonce_expired} = NonceStore.consume(nonce)
            assert {:error, :nonce_consumed} = NonceStore.consume(nonce)
    end
  end

  describe "supervision" do
    test "ETS table exists and is owned by the NonceStore process" do
      info = :ets.info(@table)
      refute info == :undefined

      owner_pid = Keyword.fetch!(info, :owner)
      assert is_pid(owner_pid)
      assert Process.alive?(owner_pid)
      assert Process.whereis(NonceStore) == owner_pid
    end
  end
end
