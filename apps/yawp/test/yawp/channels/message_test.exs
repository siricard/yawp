defmodule Yawp.Channels.MessageTest do
  use Yawp.DataCase, async: false

  alias Yawp.Channels
  alias Yawp.Identity

  setup do
    {:ok, server} = Yawp.Servers.create_server("Yawp")

    {:ok, channel} =
      Yawp.Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

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

    %{
      server: server,
      channel: channel,
      identity: identity,
      device_id: device_id,
      device_sk: device_sk,
      device_pk: device_pk
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

  test "send_message/1 persists a valid signed message", ctx do
    body = "hello world"
    ts = System.system_time(:millisecond)
    sig_b64 = sign_message(ctx.channel.id, body, ts, ctx.device_sk)

    {:ok, message} =
      Channels.send_message(%{
        channel_id: ctx.channel.id,
        author_identity_id: ctx.identity.id,
        body: body,
        signed_by: ctx.device_id,
        signature: sig_b64,
        ts: ts
      })

    assert message.body == body
    assert message.channel_id == ctx.channel.id
    assert message.author_identity_id == ctx.identity.id
    assert message.signed_by == ctx.device_id
    assert byte_size(message.signature) == 64
    assert %DateTime{} = message.server_inserted_at
  end

  test "send_message/1 rejects a mismatched signature with invalid_signature and writes nothing",
       ctx do
    body = "tampered"
    ts = System.system_time(:millisecond)
        sig_b64 = sign_message(ctx.channel.id, "original", ts, ctx.device_sk)

    assert {:error, error} =
             Channels.send_message(%{
               channel_id: ctx.channel.id,
               author_identity_id: ctx.identity.id,
               body: body,
               signed_by: ctx.device_id,
               signature: sig_b64,
               ts: ts
             })

    assert Exception.message(error) =~ "invalid_signature"

    assert {:ok, []} = Channels.list_recent_messages(ctx.channel.id)
  end

  test "list_recent_messages/1 returns ASC by server_inserted_at, capped to 50", ctx do
    ts = System.system_time(:millisecond)

    bodies =
      for i <- 1..3 do
        body = "msg #{i}"
        sig = sign_message(ctx.channel.id, body, ts + i, ctx.device_sk)

        {:ok, _} =
          Channels.send_message(%{
            channel_id: ctx.channel.id,
            author_identity_id: ctx.identity.id,
            body: body,
            signed_by: ctx.device_id,
            signature: sig,
            ts: ts + i
          })

        body
      end

    {:ok, messages} = Channels.list_recent_messages(ctx.channel.id)
    assert Enum.map(messages, & &1.body) == bodies
  end
end
