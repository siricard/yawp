defmodule Yawp.Federation.WrapperTest do
  @moduledoc """
  Signed delivery wrapper: wrap/2 canonicalises and signs a wrapper map
  binding the inner envelope by hash; unwrap/2 verifies the sending
  anchor's server signature against its published key document, rebinds
  the inner payload by hash, and dedups replays on `delivery_nonce`.
  """
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
          "public_key" => encoded_pub,
          "not_before" => "2020-01-01T00:00:00Z",
          "not_after" => "2999-01-01T00:00:00Z"
        }
      ],
      "revoked" => []
    }

    Req.Test.stub(@stub, fn conn -> Req.Test.json(conn, doc) end)
    doc
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
  end
end
