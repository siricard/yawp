defmodule Yawp.Federation.KeyDocFetcherTest do
  @moduledoc false
  use ExUnit.Case, async: false

  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.KeyDocFetcher

  @host "peer.example.com"
  @stub Yawp.Federation.KeyDocFetcher

  setup do
    KeyDocCache.clear()

    {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)
    key_id = "k-test-1"

    doc = build_doc(key_id, pub)

    %{pub: pub, priv: priv, key_id: key_id, doc: doc}
  end

  defp build_doc(key_id, pub, opts \\ []) do
    encoded_pub =
      pub
      |> Base.url_encode64(padding: false)

    %{
      "server_id" => @host,
      "keys" => [
        %{
          "key_id" => key_id,
          "alg" => "Ed25519",
          ("public_" <> "key") => encoded_pub,
          "not_before" => Keyword.get(opts, :not_before, "2020-01-01T00:00:00Z"),
          "not_after" => Keyword.get(opts, :not_after, "2999-01-01T00:00:00Z")
        }
      ],
      "revoked" => Keyword.get(opts, :revoked, [])
    }
  end

  defp stub_doc(doc) do
    Req.Test.stub(@stub, fn conn -> Req.Test.json(conn, doc) end)
  end

  defp attach(event) do
    ref = make_ref()
    parent = self()
    handler_id = {__MODULE__, event, ref}

    :telemetry.attach(
      handler_id,
      event,
      fn ^event, measurements, metadata, _ ->
        send(parent, {:telemetry, ref, measurements, metadata})
      end,
      nil
    )

    on_exit(fn -> :telemetry.detach(handler_id) end)
    ref
  end

  describe "KeyDocCache" do
    test "stores and returns a fresh entry", %{doc: doc} do
      KeyDocCache.put(@host, doc, 3600)
      assert {:ok, {^doc, _fetched_at, 3600}} = KeyDocCache.get(@host)
    end

    test "reports a miss for an unknown host" do
      assert :miss = KeyDocCache.get("nope.example.com")
    end

    test "treats an entry past its ttl as stale", %{doc: doc} do
      KeyDocCache.put(@host, doc, 0)
      assert :stale = KeyDocCache.get(@host)
    end
  end

  describe "get!/1" do
    test "fetches, parses, and caches on a miss", %{doc: doc} do
      stub_doc(doc)
      ref = attach([:yawp, :federation, :key_doc, :miss])

      assert ^doc = KeyDocFetcher.get!(@host)
      assert_receive {:telemetry, ^ref, %{count: 1}, %{host: @host}}
      assert {:ok, {^doc, _, 86_400}} = KeyDocCache.get(@host)
    end

    test "returns the cached doc without fetching when fresh", %{doc: doc} do
      KeyDocCache.put(@host, doc, 3600)

      Req.Test.stub(@stub, fn _conn ->
        raise "must not hit the network on a fresh cache hit"
      end)

      ref = attach([:yawp, :federation, :key_doc, :hit])
      assert ^doc = KeyDocFetcher.get!(@host)
      assert_receive {:telemetry, ^ref, %{count: 1}, %{host: @host}}
    end

    test "refetches when the cached entry is stale", %{doc: doc} do
      KeyDocCache.put(@host, doc, 0)
      stub_doc(doc)
      ref = attach([:yawp, :federation, :key_doc, :miss])

      assert ^doc = KeyDocFetcher.get!(@host)
      assert_receive {:telemetry, ^ref, %{count: 1}, %{host: @host}}
    end

    test "fetches a remote host over https", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("peer.example.com")
      assert_receive {:scheme, :https}
    end

    test "fetches a localhost host over http", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("localhost:14100")
      assert_receive {:scheme, :http}
    end

    test "fetches a localhost.example.com host over https", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("localhost.example.com")
      assert_receive {:scheme, :https}
    end

    test "fetches a localhostfoo host over https", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("localhostfoo")
      assert_receive {:scheme, :https}
    end

    test "fetches an anchor-prefixed staging host over https by default", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("anchor-a.staging.example")
      assert_receive {:scheme, :https}
    end

    test "fetches an explicitly insecure peer host over http", %{doc: doc} do
      previous = Application.get_env(:yawp, :federation_insecure_peer_hosts, [])
      Application.put_env(:yawp, :federation_insecure_peer_hosts, ["anchor-a.staging.example"])
      on_exit(fn -> Application.put_env(:yawp, :federation_insecure_peer_hosts, previous) end)
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("anchor-a.staging.example")
      assert_receive {:scheme, :http}
    end

    test "fetches a 127.0.0.1 host over http", %{doc: doc} do
      parent = self()

      Req.Test.stub(@stub, fn conn ->
        send(parent, {:scheme, conn.scheme})
        Req.Test.json(conn, doc)
      end)

      KeyDocFetcher.get!("127.0.0.1:14100")
      assert_receive {:scheme, :http}
    end

    test "honours a Cache-Control max-age below the 24h cap", %{doc: doc} do
      Req.Test.stub(@stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_header("cache-control", "max-age=3600")
        |> Req.Test.json(doc)
      end)

      KeyDocFetcher.get!(@host)
      assert {:ok, {^doc, _, 3600}} = KeyDocCache.get(@host)
    end

    test "caps a Cache-Control max-age above the 24h cap at 86_400", %{doc: doc} do
      Req.Test.stub(@stub, fn conn ->
        conn
        |> Plug.Conn.put_resp_header("cache-control", "max-age=604800")
        |> Req.Test.json(doc)
      end)

      KeyDocFetcher.get!(@host)
      assert {:ok, {^doc, _, 86_400}} = KeyDocCache.get(@host)
    end
  end

  describe "verify_with/4" do
    test "returns true for a signature made by the matching key", ctx do
      stub_doc(ctx.doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      assert KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end

    test "returns false for a tampered signature", ctx do
      stub_doc(ctx.doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      refute KeyDocFetcher.verify_with(@host, ctx.key_id, "other-message", sig)
    end

    test "returns false when the key_id is revoked", ctx do
      revoked_doc = build_doc(ctx.key_id, ctx.pub, revoked: [ctx.key_id])
      stub_doc(revoked_doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      refute KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end

    test "forces a refetch when the key_id is absent from the cached doc", ctx do
      stale_doc = build_doc("k-old", ctx.pub)
      KeyDocCache.put(@host, stale_doc, 3600)

      fresh_doc = build_doc(ctx.key_id, ctx.pub)
      stub_doc(fresh_doc)

      ref = attach([:yawp, :federation, :key_doc, :forced_refetch])
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      assert KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
      assert_receive {:telemetry, ^ref, %{count: 1}, %{host: @host}}
    end

    test "returns false when the key cannot be found even after refetch", ctx do
      stub_doc(build_doc("k-other", ctx.pub))
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      refute KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end

    test "rejects a key whose not_before is still in the future", ctx do
      not_yet_doc = build_doc(ctx.key_id, ctx.pub, not_before: "2999-01-01T00:00:00Z")
      stub_doc(not_yet_doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      refute KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end

    test "rejects a key whose not_after is already in the past", ctx do
      expired_doc = build_doc(ctx.key_id, ctx.pub, not_after: "2020-01-02T00:00:00Z")
      stub_doc(expired_doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      refute KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end

    test "accepts a key inside its validity window", ctx do
      windowed_doc =
        build_doc(ctx.key_id, ctx.pub,
          not_before: "2020-01-01T00:00:00Z",
          not_after: "2999-01-01T00:00:00Z"
        )

      stub_doc(windowed_doc)
      message = "wrapped-payload-bytes"
      sig = :crypto.sign(:eddsa, :none, message, [ctx.priv, :ed25519])

      assert KeyDocFetcher.verify_with(@host, ctx.key_id, message, sig)
    end
  end
end
