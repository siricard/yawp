defmodule Yawp.CanonicalJsonTest do
          use ExUnit.Case, async: true

  alias Yawp.CanonicalJson

  @fixture_path Path.expand(
                  "../../priv/test_vectors/canonical_json.json",
                  __DIR__
                )

  @vectors @fixture_path |> File.read!() |> Jason.decode!() |> Map.fetch!("vectors")

  for v <- @vectors do
    @vector v
    test "vector: " <> @vector["name"] do
      assert CanonicalJson.encode(@vector["input"]) == @vector["output"]
    end
  end

  test "object key order is independent of insertion order" do
    assert CanonicalJson.encode(%{"b" => 1, "a" => 2}) ==
             CanonicalJson.encode(%{"a" => 2, "b" => 1})
  end

  test "round-trip stability: encode(decode(encode(x))) == encode(x)" do
    x = %{"z" => [1, %{"b" => 2, "a" => "hi"}], "a" => nil}
    once = CanonicalJson.encode(x)
    {:ok, parsed} = CanonicalJson.decode(once)
    twice = CanonicalJson.encode(parsed)
    assert once == twice
  end

  test "atom keys are encoded the same as string keys" do
    assert CanonicalJson.encode(%{a: 1, b: 2}) ==
             CanonicalJson.encode(%{"a" => 1, "b" => 2})
  end
end
