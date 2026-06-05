defmodule YawpWeb.FederationPresenceTest do
  @moduledoc false
  use YawpWeb.ConnCase, async: false

  import Yawp.TestSupport.PubKey

  alias Yawp.Federation
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.PresenceBroker
  alias Yawp.Federation.Wrapper
  alias Yawp.Identity
  alias Yawp.Servers
  alias YawpWeb.Presence

  @host "anchor-a.example"
  @stub Yawp.Federation.KeyDocFetcher

  setup do
    KeyDocCache.clear()
    DeliveryNonceCache.clear()

    {:ok, _} = Federation.generate_server_key()
    {:ok, active} = Federation.get_active_server_key()
    stub_key_doc(active)

    :ok
  end

  defp stub_key_doc(active) do
    encoded_pub = pubkey_b64(active.public_key)

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
  end

  defp signed(inner) do
    Jason.decode!(Wrapper.encode_body(inner, sender_anchor_id: @host))
  end

  defp post_federation(conn, path, inner) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(path, signed(inner))
  end

  defp seed_guest(server, opts) do
    {master_pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(master_pk)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{
        did: did,
        master_public_key: master_pk,
        anchor_list: Keyword.get(opts, :anchor_list, [])
      })

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: identity.id,
      server_id: server.id,
      role_ids: [],
      kind: :guest
    })

    did
  end

  describe "POST /federation/presence/subscribe" do
    test "records the peer subscription and acknowledges", %{conn: conn} do
      did = "did:yawp:presence-sub"
      :ok = PresenceBroker.allow_subscriber(did, @host)

      conn =
        post_federation(conn, "/federation/presence/subscribe", %{
          "did" => did,
          "peer_host" => "peer-b.example"
        })

      assert json_response(conn, 200) == %{"status" => "subscribed"}
    end

    test "rejects unauthorized subscriptions before recording the peer", %{conn: conn} do
      did = "did:yawp:presence-leak"

      conn =
        post_federation(conn, "/federation/presence/subscribe", %{
          "did" => did,
          "peer_host" => "peer-b.example"
        })

      assert json_response(conn, 403) == %{"error" => "unauthorized_presence"}
    end

    test "rejects a subscribe with no did with 422", %{conn: conn} do
      conn =
        post_federation(conn, "/federation/presence/subscribe", %{"peer_host" => "peer-b.example"})

      assert json_response(conn, 422) == %{"error" => "invalid_subscribe"}
    end
  end

  describe "POST /federation/presence/notify" do
    setup do
      {:ok, server} = Servers.create_server("Guest")

      {:ok, channel} =
        Servers.create_channel(
          %{server_id: server.id, name: "general", type: :text},
          authorize?: false
        )

      %{server: server, channel: channel}
    end

    test "fans an online diff out to the channel where the user is a guest", %{
      conn: conn,
      server: server,
      channel: channel
    } do
      did = seed_guest(server, anchor_list: ["https://#{@host}"])
      topic = "server:#{server.id}:channel:#{channel.id}"
      bare = String.replace_prefix(did, "did:yawp:", "")

      conn =
        post_federation(conn, "/federation/presence/notify", %{
          "did" => did,
          "state" => "online"
        })

      assert json_response(conn, 200) == %{"status" => "noted"}
      assert Map.has_key?(Presence.list(topic), bare)
    end

    test "accepts a notify from a verified host stored as a full URL", %{
      conn: conn,
      server: server,
      channel: channel
    } do
      did = seed_guest(server, anchor_list: ["https://#{@host}/ignored/path"])
      topic = "server:#{server.id}:channel:#{channel.id}"
      bare = String.replace_prefix(did, "did:yawp:", "")

      conn =
        post_federation(conn, "/federation/presence/notify", %{
          "did" => did,
          "state" => "online"
        })

      assert json_response(conn, 200) == %{"status" => "noted"}
      assert Map.has_key?(Presence.list(topic), bare)
    end

    test "an offline diff removes the user from the channel presence", %{
      conn: conn,
      server: server,
      channel: channel
    } do
      did = seed_guest(server, anchor_list: [@host])
      topic = "server:#{server.id}:channel:#{channel.id}"
      bare = String.replace_prefix(did, "did:yawp:", "")

      post_federation(build_conn(), "/federation/presence/notify", %{
        "did" => did,
        "state" => "online"
      })

      assert Map.has_key?(Presence.list(topic), bare)

      post_federation(conn, "/federation/presence/notify", %{"did" => did, "state" => "offline"})

      refute Map.has_key?(Presence.list(topic), bare)
    end

    test "rejects an unknown state with 422", %{conn: conn} do
      conn =
        post_federation(conn, "/federation/presence/notify", %{
          "did" => "did:yawp:x",
          "state" => "bogus"
        })

      assert json_response(conn, 422) == %{"error" => "invalid_notify"}
    end

    test "rejects unauthorized notify without changing remote presence", %{
      conn: conn,
      server: server,
      channel: channel
    } do
      did = seed_guest(server, anchor_list: ["different.example"])
      topic = "server:#{server.id}:channel:#{channel.id}"
      bare = String.replace_prefix(did, "did:yawp:", "")

      conn =
        post_federation(conn, "/federation/presence/notify", %{
          "did" => did,
          "state" => "online"
        })

      assert json_response(conn, 403) == %{"error" => "unauthorized_presence"}
      refute Map.has_key?(Presence.list(topic), bare)
    end
  end

  describe "broker integration" do
    test "subscribe drives a broker push back to the peer" do
      did = "did:yawp:broker-roundtrip"
      test = self()

      name = :"broker_ctl_#{System.unique_integer([:positive])}"

      start_supervised!(
        {PresenceBroker,
         name: name,
         idle_after_ms: 60_000,
         notifier: fn peer, d, state -> send(test, {:pushed, peer, d, state}) end}
      )

      :ok = PresenceBroker.subscribe(name, did, "peer-c.example")
      assert_receive {:pushed, "peer-c.example", ^did, :offline}, 1000
    end
  end
end
