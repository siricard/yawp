defmodule YawpWeb.GuestDisplayNameFederationTest do
  @moduledoc """
  A guest who anchors elsewhere should render under their canonical
  display name, not a DID stub, once their profile has reached the
  hosting server over federation.

  Two in-process Bandit listeners stand in for two separate anchors on
  real sockets (`:14210` = Alice's anchor A, `:14211` = the server host
  B). Alice's anchor pushes her signed profile to B over HTTP; B caches
  it. Alice then joins B's `#general` as a guest and sends a message —
  the serialized history and the broadcast both carry her cached display
  name, matching the value her anchor published.
  """
  use YawpWeb.ChannelCase, async: false

  import Bitwise

  alias Yawp.Federation
  alias Yawp.Federation.Client
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  @anchor_a_port 14_210
  @host_b_port 14_211
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
        {Bandit, plug: YawpWeb.Endpoint, scheme: :http, port: @host_b_port},
        id: :host_b
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

  defp seed_guest do
    {master_pk, master_sk} = :crypto.generate_key(:eddsa, :ed25519)
    {device_pk, device_sk} = :crypto.generate_key(:eddsa, :ed25519)

    did = "did:yawp:" <> Identity.did_from_pubkey(master_pk)
    device_id = Ecto.UUID.generate()

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{
        did: did,
        master_public_key: master_pk,
        device_subkeys: %{
          "subkeys" => [
            %{
              "device_id" => device_id,
              "pk" => Base.url_encode64(device_pk, padding: false),
              "signature" => Base.url_encode64(<<0::64*8>>, padding: false),
              "issued_at" => DateTime.to_iso8601(DateTime.utc_now())
            }
          ]
        }
      })

    %{
      identity: identity,
      did: did,
      master_pk: master_pk,
      master_sk: master_sk,
      device_id: device_id,
      device_sk: device_sk
    }
  end

  defp seed_guest_membership(identity, server) do
    role =
      Ash.Seed.seed!(Yawp.Servers.Role, %{
        server_id: server.id,
        name: "guest-#{Ecto.UUID.generate()}",
        system: false,
        permission_bits: Permissions.bit(:read_messages) ||| Permissions.bit(:send_messages),
        position: 0
      })

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: identity.id,
      server_id: server.id,
      role_ids: [role.id],
      kind: :guest
    })
  end

  defp join_channel(actor, server, channel) do
    YawpWeb.UserSocket
    |> Phoenix.ChannelTest.socket(
      "identity_socket:#{actor.identity.id}-#{System.unique_integer([:positive])}",
      %{current_identity: actor.identity}
    )
    |> subscribe_and_join(YawpWeb.ServerChannelTopic, "server:#{server.id}:channel:#{channel.id}")
  end

  defp sign(map, device_sk) do
    sig = :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(map), [device_sk, :ed25519])
    Base.url_encode64(sig, padding: false)
  end

  defp sign_inner(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, Base.url_encode64(sig, padding: false))
  end

  defp send_payload(channel, actor, body) do
    ts = System.system_time(:millisecond)

    envelope = %{
      "channel_id" => channel.id,
      "sender_did" => actor.did,
      "body" => body,
      "reply_to_message_id" => nil,
      "mentions" => [],
      "attachments" => [],
      "ts" => ts
    }

    %{
      "body" => body,
      "signed_by" => actor.device_id,
      "signature" => sign(envelope, actor.device_sk),
      "ts" => ts
    }
  end

  test "a guest renders under the display name their anchor federated to the host" do
    alice = seed_guest()

    encoded_pk = Base.url_encode64(alice.master_pk, padding: false)

    ppe =
      %{
        "did" => alice.did,
        "profile_version" => 7,
        "public_key" => encoded_pk,
        "anchors" => [@sender_anchor],
        "display_name" => "Alice Canonical"
      }
      |> sign_inner("signature", alice.master_sk)

    assert {:ok, %{"status" => "applied"}} = Client.push_ppe!(peer(@host_b_port), ppe)

    assert {:ok, cached} = Identity.get_ppe_by_did(alice.did)
    assert cached.display_name == "Alice Canonical"

    {:ok, server} = Servers.create_server("Host-B-#{System.unique_integer([:positive])}")

    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    seed_guest_membership(alice.identity, server)

    {:ok, _reply, socket} = join_channel(alice, server, channel)
    assert_push "history", %{messages: []}
    assert_push "presence_state", _

    ref = push(socket, "send_message", send_payload(channel, alice, "hello from a guest"))
    assert_reply ref, :ok, %{sender_display_name: "Alice Canonical"}

    assert_broadcast "new_message", %{
      body: "hello from a guest",
      sender_display_name: "Alice Canonical"
    }

    {:ok, _reply, _viewer_socket} = join_channel(alice, server, channel)
    assert_push "history", %{messages: [message]}
    assert message.sender_display_name == "Alice Canonical"
    assert message.sender_display_name == cached.display_name
  end
end
