defmodule Yawp.Admin.SetupTokenTest do
  @moduledoc """
  `Yawp.Admin.SetupToken.consume/1` is a single-shot,
  atomic check-and-clear: exactly one concurrent caller with the
  correct token can win.
  """
  use ExUnit.Case, async: false

  alias Yawp.Admin.SetupToken

  setup do
    SetupToken.reset()
    :ok
  end

  describe "consume/1" do
    test "returns {:ok, token} once and {:error, :invalid} thereafter" do
      {:ok, token} = SetupToken.generate()
      assert {:ok, ^token} = SetupToken.consume(token)
      assert {:error, :invalid} = SetupToken.consume(token)
      assert SetupToken.current() == nil
    end

    test "returns {:error, :invalid} for the wrong token and does not clear the store" do
      {:ok, token} = SetupToken.generate()
      assert {:error, :invalid} = SetupToken.consume("nope")
      assert SetupToken.current() == token
    end

    test "returns {:error, :invalid} for empty/nil input" do
      {:ok, _token} = SetupToken.generate()
      assert {:error, :invalid} = SetupToken.consume("")
      assert {:error, :invalid} = SetupToken.consume(nil)
    end

    test "exactly one of N concurrent callers wins when the token is correct" do
      {:ok, token} = SetupToken.generate()
      n = 16

      results =
        1..n
        |> Task.async_stream(
          fn _ -> SetupToken.consume(token) end,
          max_concurrency: n,
          timeout: :infinity,
          ordered: false
        )
        |> Enum.map(fn {:ok, r} -> r end)

      wins = Enum.count(results, &match?({:ok, _}, &1))
      losses = Enum.count(results, &match?({:error, :invalid}, &1))

      assert wins == 1, "expected exactly one winner, got #{wins}; results=#{inspect(results)}"
      assert wins + losses == n
      assert SetupToken.current() == nil
    end
  end
end
