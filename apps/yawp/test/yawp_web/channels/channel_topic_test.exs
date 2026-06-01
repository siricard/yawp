defmodule YawpWeb.ChannelTopicTest do
  use YawpWeb.ChannelCase, async: false

  alias Yawp.Identity

  setup do
    {:ok, server} = Yawp.Servers.create_server("Yawp")

    {:ok, channel} =
      Yawp.Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

    {:ok, role} =
      Yawp.Servers.create_role(%{
        server_id: server.id,
        name: "Owner",
        system: true
      })

    {master_pk, _master_sk} = :crypto.generate_key(:eddsa, :ed25519)
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

    {:ok, _membership} =
      Yawp.Servers.assign_role(identity.id, server.id, [role.id])

    {:ok, _, socket} =
      YawpWeb.UserSocket
      |> Phoenix.ChannelTest.socket("identity_socket:#{identity.id}", %{
        current_identity: identity
      })
      |> subscribe_and_join(YawpWeb.ChannelTopic, "channel:#{channel.id}")

    %{
      socket: socket,
      channel: channel,
      identity: identity,
      device_id: device_id,
      device_sk: device_sk
    }
  end

  defp sign_message(channel_id, body, ts, device_sk) do
    canonical =
      Yawp.CanonicalJson.encode(%{
        "channel_id" => channel_id,
        "body" => body,
        "ts" => ts
      })

    sig = :crypto.sign(:eddsa, :none, canonical, [device_sk, :ed25519])
    Base.url_encode64(sig, padding: false)
  end

  test "join pushes a `history` event", %{socket: _socket} do
    assert_push "history", %{messages: []}
  end

  test "send broadcasts a new_message to other subscribers", ctx do
    assert_push "history", _

    body = "hello"
    ts = System.system_time(:millisecond)
    sig = sign_message(ctx.channel.id, body, ts, ctx.device_sk)

    ref =
      push(ctx.socket, "send", %{
        "body" => body,
        "signature" => sig,
        "signed_by" => ctx.device_id,
        "ts" => ts
      })

    expected_did = String.replace_prefix(ctx.identity.did, "did:yawp:", "")

    assert_reply ref, :ok, %{body: ^body, author_did: ^expected_did} = reply
    refute Map.has_key?(reply, :author_identity_id)
    assert_broadcast "new_message", %{body: ^body, author_did: ^expected_did}
  end

  test "history payload uses bare base58 author_did and omits author_identity_id", ctx do
    assert_push "history", _

    body = "first"
    ts = System.system_time(:millisecond)
    sig = sign_message(ctx.channel.id, body, ts, ctx.device_sk)

    ref =
      push(ctx.socket, "send", %{
        "body" => body,
        "signature" => sig,
        "signed_by" => ctx.device_id,
        "ts" => ts
      })

    assert_reply ref, :ok, _

    {:ok, _, socket2} =
      YawpWeb.UserSocket
      |> Phoenix.ChannelTest.socket("identity_socket:#{ctx.identity.id}-2", %{
        current_identity: ctx.identity
      })
      |> subscribe_and_join(YawpWeb.ChannelTopic, "channel:#{ctx.channel.id}")

    expected_did = String.replace_prefix(ctx.identity.did, "did:yawp:", "")

    assert_push "history", %{messages: [msg]}
    assert msg.author_did == expected_did
    refute Map.has_key?(msg, :author_identity_id)

    _ = socket2
  end

  test "send with a bad signature replies invalid_signature and does not broadcast", ctx do
    assert_push "history", _

    body = "tampered"
    ts = System.system_time(:millisecond)
    sig = sign_message(ctx.channel.id, "different", ts, ctx.device_sk)

    ref =
      push(ctx.socket, "send", %{
        "body" => body,
        "signature" => sig,
        "signed_by" => ctx.device_id,
        "ts" => ts
      })

    assert_reply ref, :error, %{reason: "invalid_signature"}
    refute_broadcast "new_message", _
  end
end
