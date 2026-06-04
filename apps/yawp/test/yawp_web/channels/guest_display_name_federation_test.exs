defmodule YawpWeb.GuestDisplayNameFederationTest do
  use YawpWeb.ChannelCase, async: false
  use Oban.Testing, repo: Yawp.Repo

  import Bitwise

  alias Yawp.Federation.MessagePipeline
  alias Yawp.Federation.PpeRefreshWorker
  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions
  alias Yawp.TestSupport.TwoAnchor

  setup do
    anchor_a = TwoAnchor.start_one!("a")
    %{anchor_a: anchor_a, host_a: TwoAnchor.host(anchor_a)}
  end

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

  defp publish_ppe_on_anchor(anchor, alice, host_a) do
    ppe =
      %{
        "did" => alice.did,
        "profile_version" => 7,
        "public_key" => Base.url_encode64(alice.master_pk, padding: false),
        "anchors" => [host_a],
        "display_name" => "Alice Canonical"
      }
      |> sign_inner("signature", alice.master_sk)

    assert {:ok, :applied} =
             TwoAnchor.call(anchor, Identity, :apply_ppe_if_newer, [ppe])

    ppe
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

  test "a guest renders under the display name fetched from their anchor over federation", %{
    anchor_a: anchor_a,
    host_a: host_a
  } do
    alice = seed_guest()

    published = publish_ppe_on_anchor(anchor_a, alice, host_a)

    assert {:ok, on_a} = TwoAnchor.call(anchor_a, Identity, :get_ppe_by_did, [alice.did])
    assert on_a.display_name == "Alice Canonical"
    assert {:ok, nil} == Identity.get_ppe_by_did(alice.did)

    inbound = %{
      "sender_did" => alice.did,
      "sender_profile_version" => published["profile_version"],
      "sender_anchors" => [host_a]
    }

    assert {:ok, :enqueued} = MessagePipeline.maybe_refresh_ppe(inbound)
    assert_enqueued(worker: PpeRefreshWorker, args: %{"did" => alice.did, "anchors" => [host_a]})
    assert :ok = perform_job(PpeRefreshWorker, %{"did" => alice.did, "anchors" => [host_a]})

    assert {:ok, fetched} = Identity.get_ppe_by_did(alice.did)
    assert fetched.display_name == "Alice Canonical"

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
    assert message.sender_display_name == fetched.display_name
  end
end
