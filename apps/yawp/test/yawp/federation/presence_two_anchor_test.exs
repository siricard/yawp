defmodule Yawp.Federation.PresenceTwoAnchorTest do
  use Yawp.DataCase, async: false

  alias Yawp.Federation
  alias Yawp.Federation.Client
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Identity

  @anchor_a_port 14_000
  @anchor_b_port 14_100
  @sender_anchor "anchor-a.example"

  setup do
    KeyDocCache.clear()
    DeliveryNonceCache.clear()
    Req.Test.set_req_test_to_shared()

    {:ok, _} = Federation.generate_server_key()
    {:ok, active} = Federation.get_active_server_key()
    stub_key_doc(active)

    start_supervised!(
      Supervisor.child_spec(
        {Bandit, plug: YawpWeb.Endpoint, scheme: :http, port: @anchor_a_port},
        id: :anchor_a
      )
    )

    start_supervised!(
      Supervisor.child_spec(
        {Bandit, plug: YawpWeb.Endpoint, scheme: :http, port: @anchor_b_port},
        id: :anchor_b
      )
    )

    prev = Application.get_env(:yawp, Client)
    Application.put_env(:yawp, Client, anchor_id: @sender_anchor)

    on_exit(fn ->
      if prev do
        Application.put_env(:yawp, Client, prev)
      else
        Application.delete_env(:yawp, Client)
      end
    end)

    :ok
  end

  defp stub_key_doc(active) do
    encoded_pub = Base.url_encode64(active.public_key, padding: false)

    doc = %{
      "server_id" => @sender_anchor,
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

    Req.Test.stub(Yawp.Federation.KeyDocFetcher, fn conn -> Req.Test.json(conn, doc) end)
  end

  defp peer(port), do: "localhost:#{port}"

  test "a presence change at A reaches B's guest channel presence" do
    {master_pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(master_pk)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: master_pk})

    {:ok, server} = Yawp.Servers.create_server("Guest-#{System.unique_integer([:positive])}")

    {:ok, channel} =
      Yawp.Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: identity.id,
      server_id: server.id,
      role_ids: [],
      kind: :guest
    })

    topic = "server:#{server.id}:channel:#{channel.id}"
    bare = String.replace_prefix(did, "did:yawp:", "")

    test = self()

    name = :"two_anchor_broker_#{System.unique_integer([:positive])}"

    start_supervised!(
      {Yawp.Federation.PresenceBroker,
       name: name,
       idle_after_ms: 60_000,
       notifier: fn peer_host, d, state ->
         {:ok, _} =
           Client.notify_presence!(peer_host, %{"did" => d, "state" => to_string(state)})

         send(test, {:notified, peer_host, d, state})
       end}
    )

    Phoenix.PubSub.subscribe(Yawp.PubSub, "user:#{bare}")

    tracker =
      spawn(fn ->
        {:ok, _} =
          YawpWeb.Presence.track(self(), "user:#{bare}", "device-1", %{
            online_at: System.system_time(:second)
          })

        send(test, :tracked)
        receive(do: (:stop -> :ok))
      end)

    assert_receive :tracked, 2000

    :ok = Yawp.Federation.PresenceBroker.subscribe(name, did, peer(@anchor_b_port))

    assert_receive {:notified, _, ^did, :online}, 30_000
    assert Map.has_key?(YawpWeb.Presence.list(topic), bare)

    send(tracker, :stop)
  end
end
