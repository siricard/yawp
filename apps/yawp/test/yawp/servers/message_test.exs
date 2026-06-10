defmodule Yawp.Servers.MessageTest do
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  setup do
    {:ok, server} = Servers.create_server("Yawp")

    {:ok, channel_a} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    {:ok, channel_b} =
      Servers.create_channel(
        %{server_id: server.id, name: "random", type: :text},
        authorize?: false
      )

    sender = seed_identity()

    %{server: server, channel_a: channel_a, channel_b: channel_b, sender: sender}
  end

  defp seed_identity do
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

    %{identity: identity, did: did, device_id: device_id, device_sk: device_sk}
  end

  defp sign(canonical_map, device_sk) do
    sig =
      :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(canonical_map), [device_sk, :ed25519])

    Base.url_encode64(sig, padding: false)
  end

  defp send_message(channel, sender, body, opts \\ []) do
    ts = Keyword.get(opts, :ts, System.system_time(:millisecond))
    reply_to = Keyword.get(opts, :reply_to_message_id)
    mentions = Keyword.get(opts, :mentions, [])
    attachments = Keyword.get(opts, :attachments, [])

    envelope = %{
      "channel_id" => channel.id,
      "sender_did" => sender.did,
      "body" => body,
      "reply_to_message_id" => reply_to,
      "mentions" => mentions,
      "attachments" => attachments,
      "ts" => ts
    }

    Servers.send_server_message(%{
      channel_id: channel.id,
      sender_did: sender.did,
      body: body,
      reply_to_message_id: reply_to,
      mentions: mentions,
      attachments: attachments,
      signed_by: sender.device_id,
      signature: sign(envelope, sender.device_sk),
      ts: ts
    })
  end

  describe "send" do
    test "persists a valid signed message with server_serial 1", ctx do
      {:ok, message} = send_message(ctx.channel_a, ctx.sender, "hello world")

      assert message.body == "hello world"
      assert message.channel_id == ctx.channel_a.id
      assert message.sender_did == ctx.sender.did
      assert message.signed_by == ctx.sender.device_id
      assert byte_size(message.sender_signature) == 64
      assert message.server_serial == 1
      assert %DateTime{} = message.server_inserted_at
    end

    test "rejects a mismatched signature and writes nothing", ctx do
      ts = System.system_time(:millisecond)

      tampered_sig =
        sign(
          %{
            "channel_id" => ctx.channel_a.id,
            "sender_did" => ctx.sender.did,
            "body" => "original",
            "reply_to_message_id" => nil,
            "mentions" => [],
            "attachments" => [],
            "ts" => ts
          },
          ctx.sender.device_sk
        )

      assert {:error, error} =
               Servers.send_server_message(%{
                 channel_id: ctx.channel_a.id,
                 sender_did: ctx.sender.did,
                 body: "tampered",
                 mentions: [],
                 attachments: [],
                 signed_by: ctx.sender.device_id,
                 signature: tampered_sig,
                 ts: ts
               })

      assert Exception.message(error) =~ "invalid_signature"
      assert {:ok, []} = Servers.list_channel_messages(ctx.channel_a.id)
    end

    test "assigns a monotonic per-channel serial", ctx do
      {:ok, a1} = send_message(ctx.channel_a, ctx.sender, "a1")
      {:ok, a2} = send_message(ctx.channel_a, ctx.sender, "a2")
      {:ok, b1} = send_message(ctx.channel_b, ctx.sender, "b1")
      {:ok, a3} = send_message(ctx.channel_a, ctx.sender, "a3")

      assert a1.server_serial == 1
      assert a2.server_serial == 2
      assert a3.server_serial == 3
      assert b1.server_serial == 1
    end

    test "orders by server_serial, not client ts", ctx do
      {:ok, _} = send_message(ctx.channel_a, ctx.sender, "first", ts: 3_000)
      {:ok, _} = send_message(ctx.channel_a, ctx.sender, "second", ts: 1_000)
      {:ok, _} = send_message(ctx.channel_a, ctx.sender, "third", ts: 2_000)

      {:ok, messages} = Servers.list_channel_messages(ctx.channel_a.id)
      assert Enum.map(messages, & &1.body) == ["first", "second", "third"]
      assert Enum.map(messages, & &1.server_serial) == [1, 2, 3]
    end

    test "stores reply_to_message_id, mentions and attachments", ctx do
      {:ok, parent} = send_message(ctx.channel_a, ctx.sender, "parent")

      {:ok, reply} =
        send_message(ctx.channel_a, ctx.sender, "child",
          reply_to_message_id: parent.id,
          mentions: [ctx.sender.did],
          attachments: [%{"url" => "https://example.com/a.png", "kind" => "image"}]
        )

      assert reply.reply_to_message_id == parent.id
      assert reply.mentions == [ctx.sender.did]
      assert [%{"url" => "https://example.com/a.png"}] = reply.attachments
    end

    test "rejects messages with more attachments than configured", ctx do
      previous = Application.get_env(:yawp, :attachments, [])

      Application.put_env(
        :yawp,
        :attachments,
        Keyword.put(previous, :max_attachments_per_message, 1)
      )

      on_exit(fn -> Application.put_env(:yawp, :attachments, previous) end)

      assert {:error, error} =
               send_message(ctx.channel_a, ctx.sender, "too many",
                 attachments: [%{"upload_id" => "u1"}, %{"upload_id" => "u2"}]
               )

      assert Exception.message(error) =~ "too_many_attachments"
    end
  end

  describe "edit" do
    setup ctx do
      {:ok, message} = send_message(ctx.channel_a, ctx.sender, "v1")
      Map.put(ctx, :message, message)
    end

    defp edit_message(message, editor, body, opts \\ []) do
      ts = Keyword.get(opts, :ts, System.system_time(:millisecond))

      envelope = %{"message_id" => message.id, "body" => body, "ts" => ts}

      Servers.edit_server_message(%{
        message_id: message.id,
        body: body,
        signed_by: editor.device_id,
        signature: sign(envelope, editor.device_sk),
        ts: ts
      })
    end

    test "appends a signed edit by the original author", ctx do
      {:ok, edit} = edit_message(ctx.message, ctx.sender, "v2")

      assert edit.message_id == ctx.message.id
      assert edit.body == "v2"
      assert edit.edit_serial == 1
      assert byte_size(edit.sender_signature) == 64
    end

    test "increments edit_serial across successive edits", ctx do
      {:ok, e1} = edit_message(ctx.message, ctx.sender, "v2")
      {:ok, e2} = edit_message(ctx.message, ctx.sender, "v3")

      assert e1.edit_serial == 1
      assert e2.edit_serial == 2
    end

    test "rejects an edit signed by a different identity", ctx do
      other = seed_identity()

      assert {:error, error} = edit_message(ctx.message, other, "hijack")
      assert Exception.message(error) =~ "invalid_signature"
      assert {:ok, []} = Servers.list_message_edits(ctx.message.id)
    end

    test "rejects an edit with a mismatched signature", ctx do
      ts = System.system_time(:millisecond)

      bad_sig =
        sign(
          %{"message_id" => ctx.message.id, "body" => "other", "ts" => ts},
          ctx.sender.device_sk
        )

      assert {:error, error} =
               Servers.edit_server_message(%{
                 message_id: ctx.message.id,
                 body: "v2",
                 signed_by: ctx.sender.device_id,
                 signature: bad_sig,
                 ts: ts
               })

      assert Exception.message(error) =~ "invalid_signature"
    end
  end

  describe "delete" do
    setup ctx do
      {:ok, message} = send_message(ctx.channel_a, ctx.sender, "secret")
      Map.put(ctx, :message, message)
    end

    defp tombstone(message, actor, reason, opts \\ []) do
      ts = Keyword.get(opts, :ts, System.system_time(:millisecond))

      envelope = %{
        "message_id" => message.id,
        "reason" => reason,
        "actor_did" => actor.did,
        "ts" => ts
      }

      Servers.delete_server_message(%{
        message_id: message.id,
        reason: reason,
        actor_did: actor.did,
        signed_by: actor.device_id,
        signature: sign(envelope, actor.device_sk),
        ts: ts
      })
    end

    test "sender delete wipes the body and preserves the timeline slot", ctx do
      {:ok, tomb} = tombstone(ctx.message, ctx.sender, "sender")

      assert tomb.message_id == ctx.message.id
      assert tomb.reason == :sender
      assert tomb.actor_did == ctx.sender.did

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert message.id == ctx.message.id
      assert message.server_serial == ctx.message.server_serial
      assert is_nil(message.body)
    end

    test "moderator with manage_messages can delete another user's message", ctx do
      moderator = seed_identity()
      seed_membership_with_bits(moderator, ctx.server, [:manage_messages])

      {:ok, tomb} = tombstone(ctx.message, moderator, "moderator")

      assert tomb.reason == :moderator
      assert tomb.actor_did == moderator.did

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert is_nil(message.body)
    end

    test "rejects a moderator delete without manage_messages", ctx do
      member = seed_identity()
      seed_membership_with_bits(member, ctx.server, [])

      assert {:error, error} = tombstone(ctx.message, member, "moderator")
      assert Exception.message(error) =~ "manage_messages"

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert message.body == "secret"
    end

    test "rejects a client-submitted retention-reason delete from a non-privileged identity",
         ctx do
      member = seed_identity()
      seed_membership_with_bits(member, ctx.server, [])

      assert {:error, _error} = tombstone(ctx.message, member, "retention")

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert message.body == "secret"
      assert {:ok, []} = Servers.list_message_tombstones(ctx.message.id)
    end

    test "rejects a client-submitted retention-reason delete even from the sender", ctx do
      assert {:error, _error} = tombstone(ctx.message, ctx.sender, "retention")

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert message.body == "secret"
    end

    test "rejects a tombstone with a mismatched signature", ctx do
      ts = System.system_time(:millisecond)

      bad =
        sign(
          %{
            "message_id" => ctx.message.id,
            "reason" => "sender",
            "actor_did" => ctx.sender.did,
            "ts" => ts + 1
          },
          ctx.sender.device_sk
        )

      assert {:error, error} =
               Servers.delete_server_message(%{
                 message_id: ctx.message.id,
                 reason: "sender",
                 actor_did: ctx.sender.did,
                 signed_by: ctx.sender.device_id,
                 signature: bad,
                 ts: ts
               })

      assert Exception.message(error) =~ "invalid_signature"
    end

    test "archives the body when body_archive_enabled is on", ctx do
      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_body_archive, %{body_archive_enabled: true})
        |> Ash.update(authorize?: false)

      {:ok, _tomb} = tombstone(ctx.message, ctx.sender, "sender")

      operator = seed_identity()
      seed_membership_with_bits(operator, ctx.server, [:manage_messages])

      {:ok, [archived]} =
        Servers.list_archived_bodies_for_message(ctx.message.id, actor: operator.identity)

      assert archived.body == "secret"

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel_a.id)
      assert is_nil(message.body)
    end

    test "does not archive the body when body_archive_enabled is off", ctx do
      {:ok, _tomb} = tombstone(ctx.message, ctx.sender, "sender")

      operator = seed_identity()
      seed_membership_with_bits(operator, ctx.server, [:manage_messages])

      assert {:ok, []} =
               Servers.list_archived_bodies_for_message(ctx.message.id, actor: operator.identity)
    end

    test "denies archived-body reads to a non-privileged identity", ctx do
      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_body_archive, %{body_archive_enabled: true})
        |> Ash.update(authorize?: false)

      {:ok, _tomb} = tombstone(ctx.message, ctx.sender, "sender")

      member = seed_identity()
      seed_membership_with_bits(member, ctx.server, [])

      assert {:error, %Ash.Error.Forbidden{}} =
               Servers.list_archived_bodies_for_message(ctx.message.id, actor: member.identity)
    end

    test "denies archived-body reads to an actorless caller", ctx do
      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_body_archive, %{body_archive_enabled: true})
        |> Ash.update(authorize?: false)

      {:ok, _tomb} = tombstone(ctx.message, ctx.sender, "sender")

      assert {:error, %Ash.Error.Forbidden{}} =
               Servers.list_archived_bodies_for_message(ctx.message.id, actor: nil)
    end
  end

  defp seed_membership_with_bits(actor, server, bit_names) do
    bits = Enum.reduce(bit_names, 0, fn name, acc -> Bitwise.bor(acc, Permissions.bit(name)) end)

    role =
      Ash.Seed.seed!(Yawp.Servers.Role, %{
        server_id: server.id,
        name: "role-#{Ecto.UUID.generate()}",
        system: false,
        permission_bits: bits,
        position: 0
      })

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: actor.identity.id,
      server_id: server.id,
      role_ids: [role.id],
      kind: :anchored
    })
  end
end
