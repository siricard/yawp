defmodule Yawp.Federation.WrapperTest do
  @moduledoc false
  use Yawp.DataCase, async: false

  import Bitwise

  alias Yawp.CanonicalJson
  alias Yawp.Federation
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.Wrapper

  @host "anchor-a.example"
  @stub Yawp.Federation.KeyDocFetcher

  setup do
    KeyDocCache.clear()
    DeliveryNonceCache.clear()

    {:ok, _} = Federation.generate_server_key()
    {:ok, active} = Federation.get_active_server_key()
    stub_key_doc(active)

    %{key: active}
  end

  defp stub_key_doc(active) do
    encoded_pub =
      active.public_key
      |> Base.url_encode64(padding: false)

    doc = %{
      "server_id" => @host,
      "keys" => [
        %{
          "key_id" => active.key_id,
          "alg" => "Ed25519",
          ("public_" <> "key") => encoded_pub,
          "not_before" => "2020-01-01T00:00:00Z",
          "not_after" => "2999-01-01T00:00:00Z"
        }
      ],
      "revoked" => []
    }

    Req.Test.stub(@stub, fn conn -> Req.Test.json(conn, doc) end)
    doc
  end

  defp without_req_test_stub(fun) do
    previous = Application.get_env(:yawp, @stub)

    Application.put_env(:yawp, @stub,
      req_options: [
        connect_options: [timeout: 50],
        receive_timeout: 50,
        retry: false
      ]
    )

    try do
      fun.()
    after
      Application.put_env(:yawp, @stub, previous)
    end
  end

  defp tamper(<<first, rest::binary>>), do: <<bxor(first, 1), rest::binary>>

  describe "wrap/2" do
    test "returns a canonical wrapper string, 64-byte signature, and key_id", %{key: active} do
      inner = %{"envelope_id" => "abc", "body" => "hi"}
      {wrapped, sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      assert is_binary(wrapped)
      assert byte_size(sig) == 64
      assert key_id == active.key_id

      decoded = Jason.decode!(wrapped)
      assert decoded["sender_anchor_id"] == @host
      assert decoded["delivery_nonce"] =~ ~r/\A[0-9a-f]{32}\z/
      assert is_binary(decoded["delivery_timestamp"])

      assert decoded["inner_payload_hash"] ==
               Base.encode16(:crypto.hash(:sha256, CanonicalJson.encode(inner)), case: :lower)

      assert :crypto.verify(:eddsa, :none, wrapped, sig, [active.public_key, :ed25519])
    end

    test "emits the canonical encoding of the wrapper as the signed bytes" do
      inner = %{"z" => 1, "a" => 2}
      {wrapped, _sig, _key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)
      assert wrapped == CanonicalJson.encode(Jason.decode!(wrapped))
    end

    test "produces a unique nonce per call" do
      inner = %{"k" => "v"}
      {w1, _, _} = Wrapper.wrap(inner, sender_anchor_id: @host)
      {w2, _, _} = Wrapper.wrap(inner, sender_anchor_id: @host)
      assert Jason.decode!(w1)["delivery_nonce"] != Jason.decode!(w2)["delivery_nonce"]
    end
  end

  describe "unwrap/2" do
    test "round-trips a wrapped inner envelope" do
      inner = %{"envelope_id" => "e1", "body" => "hello", "n" => 7}
      body = Wrapper.encode_body(inner, sender_anchor_id: @host)
      assert {:ok, ^inner, @host} = Wrapper.unwrap(body, [])
    end

    test "accepts an already-decoded map body" do
      inner = %{"a" => 1}
      body = Wrapper.encode_body(inner, sender_anchor_id: @host)
      assert {:ok, ^inner, @host} = Wrapper.unwrap(Jason.decode!(body), [])
    end

    test "rejects a tampered signature" do
      inner = %{"x" => "y"}
      {wrapped, sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      body = %{
        "wrapper" => wrapped,
        "signature" => Base.encode64(tamper(sig)),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:error, :invalid_signature} = Wrapper.unwrap(body, [])
    end

    test "rejects when the wrapper string is mutated after signing" do
      inner = %{"x" => "y"}
      {wrapped, sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      body = %{
        "wrapper" => String.replace(wrapped, "anchor-a", "anchor-evil"),
        "signature" => Base.encode64(sig),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:error, :invalid_signature} = Wrapper.unwrap(body, [])
    end

    test "rejects when the inner payload hash does not match" do
      inner = %{"x" => "y"}
      {wrapped, sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      body = %{
        "wrapper" => wrapped,
        "signature" => Base.encode64(sig),
        "key_id" => key_id,
        "inner" => %{"x" => "TAMPERED"}
      }

      assert {:error, :payload_hash_mismatch} = Wrapper.unwrap(body, [])
    end

    test "dedups replays on delivery_nonce" do
      inner = %{"id" => "dup"}
      body = Wrapper.encode_body(inner, sender_anchor_id: @host)

      assert {:ok, ^inner, @host} = Wrapper.unwrap(body, [])
      assert {:error, :replay} = Wrapper.unwrap(body, [])
    end

    test "a failed verification does not consume the nonce" do
      inner = %{"id" => "keep"}
      {wrapped, sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)
      nonce = Jason.decode!(wrapped)["delivery_nonce"]

      bad_body = %{
        "wrapper" => wrapped,
        "signature" => Base.encode64(tamper(sig)),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:error, :invalid_signature} = Wrapper.unwrap(bad_body, [])
      refute DeliveryNonceCache.seen?(nonce)

      good_body = %{
        "wrapper" => wrapped,
        "signature" => Base.encode64(sig),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:ok, ^inner, @host} = Wrapper.unwrap(good_body, [])
    end

    test "rejects a malformed body" do
      assert {:error, :malformed} = Wrapper.unwrap("not json", [])
      assert {:error, :malformed} = Wrapper.unwrap(%{"wrapper" => "x"}, [])
      assert {:error, :malformed} = Wrapper.unwrap(42, [])
    end

    test "normalizes assorted malformed input to {:error, _} without crashing" do
      good = Jason.decode!(Wrapper.encode_body(%{"a" => 1}, sender_anchor_id: @host))

      malformed = [
        nil,
        [],
        [1, 2, 3],
        "",
        "{",
        "[1, 2, 3]",
        Jason.encode!([1, 2, 3]),
        %{},
        %{"wrapper" => 1, "signature" => 2, "key_id" => 3, "inner" => 4},
        %{"wrapper" => "x", "signature" => "y", "key_id" => "z"},
        %{"signature" => "y", "key_id" => "z", "inner" => %{}},
        Map.put(good, "wrapper", Jason.encode!([1, 2])),
        Map.put(good, "wrapper", Jason.encode!("scalar")),
        Map.put(good, "signature", "!!! not base64 !!!"),
        Map.put(good, "inner", "not a map")
      ]

      for body <- malformed do
        assert {:error, reason} = Wrapper.unwrap(body, [])
        assert is_atom(reason)
      end
    end

    test "rejects a wrapper missing sender_anchor_id with an error tuple" do
      inner = %{"x" => "y"}
      {_wrapped, _sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      wrapper = %{
        "delivery_nonce" => "n-no-sender",
        "delivery_timestamp" => "2024-01-01T00:00:00Z",
        "inner_payload_hash" => "deadbeef"
      }

      canonical = CanonicalJson.encode(wrapper)
      {:ok, sig, _} = Federation.sign(wrapper)

      body = %{
        "wrapper" => canonical,
        "signature" => Base.encode64(sig),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:error, reason} = Wrapper.unwrap(body, [])
      assert is_atom(reason)
    end

    test "rejects a wrapper missing delivery_nonce without raising" do
      inner = %{"x" => "y"}
      {_wrapped, _sig, key_id} = Wrapper.wrap(inner, sender_anchor_id: @host)

      wrapper = %{
        "delivery_timestamp" => "2024-01-01T00:00:00Z",
        "sender_anchor_id" => @host,
        "inner_payload_hash" =>
          Base.encode16(:crypto.hash(:sha256, CanonicalJson.encode(inner)), case: :lower)
      }

      canonical = CanonicalJson.encode(wrapper)
      {:ok, sig, _} = Federation.sign(wrapper)

      body = %{
        "wrapper" => canonical,
        "signature" => Base.encode64(sig),
        "key_id" => key_id,
        "inner" => inner
      }

      assert {:error, reason} = Wrapper.unwrap(body, [])
      assert is_atom(reason)
    end

    test "normalizes malformed sender anchor hosts to an error tuple" do
      without_req_test_stub(fn ->
        inner = %{"x" => "y"}
        body = Wrapper.encode_body(inner, sender_anchor_id: "bad host")

        assert {:error, reason} = Wrapper.unwrap(body, [])
        assert is_atom(reason)
      end)
    end

    test "normalizes unreachable sender anchor hosts to an error tuple" do
      without_req_test_stub(fn ->
        inner = %{"x" => "y"}
        body = Wrapper.encode_body(inner, sender_anchor_id: "127.0.0.1:9")

        assert {:error, reason} = Wrapper.unwrap(body, [])
        assert is_atom(reason)
      end)
    end
  end

  describe "DeliveryNonceCache" do
    test "records and reports a nonce as seen" do
      refute DeliveryNonceCache.seen?("n1")
      assert :ok = DeliveryNonceCache.record("n1")
      assert DeliveryNonceCache.seen?("n1")
      assert {:error, :replay} = DeliveryNonceCache.record("n1")
    end

    test "an expired entry is re-accepted" do
      assert :ok = DeliveryNonceCache.record("n2", -1)
      refute DeliveryNonceCache.seen?("n2")
      assert :ok = DeliveryNonceCache.record("n2")
    end

    test "sweep drops expired entries" do
      assert :ok = DeliveryNonceCache.record("old", -1)
      assert :ok = DeliveryNonceCache.record("fresh")
      DeliveryNonceCache.sweep()
      assert DeliveryNonceCache.size() == 1
      assert DeliveryNonceCache.seen?("fresh")
    end

    test "exactly one of many concurrent claims for the same nonce wins" do
      nonce = "race-nonce"
      claimants = 200

      results =
        1..claimants
        |> Task.async_stream(fn _ -> DeliveryNonceCache.record(nonce) end,
          max_concurrency: claimants,
          timeout: :infinity
        )
        |> Enum.map(fn {:ok, result} -> result end)

      assert Enum.count(results, &(&1 == :ok)) == 1
      assert Enum.count(results, &(&1 == {:error, :replay})) == claimants - 1
    end
  end
end
