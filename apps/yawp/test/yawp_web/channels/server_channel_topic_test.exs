defmodule YawpWeb.ServerChannelTopicTest do
  use YawpWeb.ChannelCase, async: false

  import Bitwise

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  setup do
    {:ok, server} = Servers.create_server("Yawp")

    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    %{server: server, channel: channel}
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

  defp seed_membership(actor, server, bit_names) do
    bits = Enum.reduce(bit_names, 0, fn name, acc -> acc ||| Permissions.bit(name) end)

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

  defp topic(server, channel), do: "server:#{server.id}:channel:#{channel.id}"

  defp join_channel(actor, server, channel, params \\ %{}) do
    YawpWeb.UserSocket
    |> Phoenix.ChannelTest.socket(
      "identity_socket:#{actor.identity.id}-#{System.unique_integer([:positive])}",
      %{
        current_identity: actor.identity
      }
    )
    |> subscribe_and_join(YawpWeb.ServerChannelTopic, topic(server, channel), params)
  end

  defp sign(map, device_sk) do
    sig = :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(map), [device_sk, :ed25519])
    Base.url_encode64(sig, padding: false)
  end

  defp send_payload(channel, actor, body, opts \\ []) do
    ts = Keyword.get(opts, :ts, System.system_time(:millisecond))

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

  describe "join authorization" do
    test "member with read_messages joins and receives a history + presence_state", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])

      assert {:ok, _, _socket} = join_channel(actor, ctx.server, ctx.channel)
      assert_push "history", %{messages: []}
      assert_push "presence_state", state
      did = String.replace_prefix(actor.did, "did:yawp:", "")
      assert Map.has_key?(state, did)
    end

    test "the join reply carries the resolved effective_bits for the joiner", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])

      assert {:ok, reply, _socket} = join_channel(actor, ctx.server, ctx.channel)

      expected =
        Permissions.bit(:read_messages) ||| Permissions.bit(:send_messages)

      assert reply == %{effective_bits: expected}
      refute Permissions.has?(reply.effective_bits, :manage_messages)
    end

    test "owner short-circuits to all bits and the join reply carries them", ctx do
      actor = seed_identity()

      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_owner, %{owner_did: actor.did})
        |> Ash.update(authorize?: false)

      seed_membership(actor, ctx.server, [])

      assert {:ok, reply, _socket} = join_channel(actor, ctx.server, ctx.channel)
      assert reply == %{effective_bits: Permissions.all_bits()}
      assert Permissions.has?(reply.effective_bits, :manage_messages)
      assert Permissions.has?(reply.effective_bits, :ban_members)
    end

    test "a channel allow override widens the effective_bits in the join reply", ctx do
      actor = seed_identity()
      membership = seed_membership(actor, ctx.server, [:read_messages])

      [role_id] = membership.role_ids

      Ash.Seed.seed!(Yawp.Servers.ChannelOverride, %{
        channel_id: ctx.channel.id,
        role_id: role_id,
        allow_bits: Permissions.bit(:manage_messages),
        deny_bits: 0
      })

      assert {:ok, reply, _socket} = join_channel(actor, ctx.server, ctx.channel)
      assert Permissions.has?(reply.effective_bits, :manage_messages)
    end

    test "watch mode authorizes read_messages but skips history and presence", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])

      assert {:ok, _reply, _socket} =
               join_channel(actor, ctx.server, ctx.channel, %{"mode" => "watch"})

      refute_push "history", _
      refute_push "presence_state", _
    end

    test "watch mode still receives new_message broadcasts", ctx do
      watcher = seed_identity()
      seed_membership(watcher, ctx.server, [:read_messages, :send_messages])

      {:ok, _reply, _watch_socket} =
        join_channel(watcher, ctx.server, ctx.channel, %{"mode" => "watch"})

      sender = seed_identity()
      seed_membership(sender, ctx.server, [:read_messages, :send_messages])
      {:ok, _, sender_socket} = join_channel(sender, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ref = push(sender_socket, "send_message", send_payload(ctx.channel, sender, "ping"))
      assert_reply ref, :ok, _
      assert_push "new_message", %{body: "ping"}
    end

    test "watch mode is still rejected without read_messages", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:send_messages])

      assert {:error, %{reason: "unauthorized"}} =
               join_channel(actor, ctx.server, ctx.channel, %{"mode" => "watch"})
    end

    test "identity without read_messages is rejected", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:send_messages])

      assert {:error, %{reason: "unauthorized"}} = join_channel(actor, ctx.server, ctx.channel)
    end

    test "non-member is rejected", ctx do
      actor = seed_identity()

      assert {:error, %{reason: "unauthorized"}} = join_channel(actor, ctx.server, ctx.channel)
    end

    test "channel not belonging to the topic server is rejected", ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages])

      {:ok, other_server} = Servers.create_server("Other")

      {:error, %{reason: reason}} =
        YawpWeb.UserSocket
        |> Phoenix.ChannelTest.socket("identity_socket:#{actor.identity.id}", %{
          current_identity: actor.identity
        })
        |> subscribe_and_join(
          YawpWeb.ServerChannelTopic,
          "server:#{other_server.id}:channel:#{ctx.channel.id}"
        )

      assert reason in ["unauthorized", "bad_topic"]
    end
  end

  describe "send_message" do
    setup ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])
      {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _
      Map.merge(ctx, %{actor: actor, socket: socket})
    end

    test "broadcasts new_message on a valid signed payload", ctx do
      ref = push(ctx.socket, "send_message", send_payload(ctx.channel, ctx.actor, "hello"))

      did = String.replace_prefix(ctx.actor.did, "did:yawp:", "")
      assert_reply ref, :ok, %{body: "hello", sender_did: ^did, server_serial: 1}
      assert_broadcast "new_message", %{body: "hello", sender_did: ^did, server_serial: 1}
    end

    test "rejects a tampered signature without broadcasting", ctx do
      payload = send_payload(ctx.channel, ctx.actor, "real")
      tampered = Map.put(payload, "body", "tampered")

      ref = push(ctx.socket, "send_message", tampered)
      assert_reply ref, :error, %{reason: "invalid_signature"}
      refute_broadcast "new_message", _
    end
  end

  test "send_message is denied without the send_messages bit", ctx do
    actor = seed_identity()
    seed_membership(actor, ctx.server, [:read_messages])
    {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
    assert_push "history", _
    assert_push "presence_state", _

    ref = push(socket, "send_message", send_payload(ctx.channel, actor, "nope"))
    assert_reply ref, :error, %{reason: "unauthorized"}
    refute_broadcast "new_message", _
  end

  describe "edit_message" do
    setup ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])
      {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ref = push(socket, "send_message", send_payload(ctx.channel, actor, "v1"))
      assert_reply ref, :ok, %{id: message_id}

      Map.merge(ctx, %{actor: actor, socket: socket, message_id: message_id})
    end

    test "author can edit and a message_edited is broadcast", ctx do
      ts = System.system_time(:millisecond)

      envelope = %{"message_id" => ctx.message_id, "body" => "v2", "ts" => ts}

      ref =
        push(ctx.socket, "edit_message", %{
          "message_id" => ctx.message_id,
          "body" => "v2",
          "signed_by" => ctx.actor.device_id,
          "signature" => sign(envelope, ctx.actor.device_sk),
          "ts" => ts
        })

      assert_reply ref, :ok, %{message_id: edited_id, body: "v2", edit_serial: 1}
      assert edited_id == ctx.message_id
      assert_broadcast "message_edited", %{message_id: ^edited_id, body: "v2", edit_serial: 1}
    end

    test "non-author cannot edit another user's message", ctx do
      other = seed_identity()
      seed_membership(other, ctx.server, [:read_messages, :send_messages])
      {:ok, _, other_socket} = join_channel(other, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ts = System.system_time(:millisecond)
      envelope = %{"message_id" => ctx.message_id, "body" => "hijack", "ts" => ts}

      ref =
        push(other_socket, "edit_message", %{
          "message_id" => ctx.message_id,
          "body" => "hijack",
          "signed_by" => other.device_id,
          "signature" => sign(envelope, other.device_sk),
          "ts" => ts
        })

      assert_reply ref, :error, %{reason: reason}
      assert reason in ["invalid_signature", "unauthorized"]
      refute_broadcast "message_edited", _
    end

    test "rejoining after an edit serves the edited body and an edited flag in history", ctx do
      ts = System.system_time(:millisecond)
      envelope = %{"message_id" => ctx.message_id, "body" => "v2", "ts" => ts}

      ref =
        push(ctx.socket, "edit_message", %{
          "message_id" => ctx.message_id,
          "body" => "v2",
          "signed_by" => ctx.actor.device_id,
          "signature" => sign(envelope, ctx.actor.device_sk),
          "ts" => ts
        })

      assert_reply ref, :ok, %{edit_serial: 1}

      {:ok, _, _socket} = join_channel(ctx.actor, ctx.server, ctx.channel)
      mid = ctx.message_id
      assert_push "history", %{messages: [message]}
      assert message.id == mid
      assert message.body == "v2"
      assert message.edited == true
      assert_push "presence_state", _
    end

    test "an unedited message reports edited false in history", ctx do
      {:ok, _, _socket} = join_channel(ctx.actor, ctx.server, ctx.channel)
      mid = ctx.message_id
      assert_push "history", %{messages: [message]}
      assert message.id == mid
      assert message.body == "v1"
      assert message.edited == false
      assert_push "presence_state", _
    end

    test "author cannot edit their message from a different channel topic", ctx do
      {:ok, other_channel} =
        Servers.create_channel(
          %{server_id: ctx.server.id, name: "other", type: :text},
          authorize?: false
        )

      {:ok, _, other_socket} = join_channel(ctx.actor, ctx.server, other_channel)
      assert_push "history", _
      assert_push "presence_state", _

      ts = System.system_time(:millisecond)
      envelope = %{"message_id" => ctx.message_id, "body" => "cross", "ts" => ts}

      ref =
        push(other_socket, "edit_message", %{
          "message_id" => ctx.message_id,
          "body" => "cross",
          "signed_by" => ctx.actor.device_id,
          "signature" => sign(envelope, ctx.actor.device_sk),
          "ts" => ts
        })

      assert_reply ref, :error, %{reason: "unauthorized"}
      refute_broadcast "message_edited", _

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel.id)
      assert message.body == "v1"
    end
  end

  describe "kick invalidation" do
    test "a kicked member's joined socket is pushed a removed event", ctx do
      owner = seed_identity()

      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_owner, %{owner_did: owner.did})
        |> Ash.update(authorize?: false)

      seed_membership(owner, ctx.server, [])

      victim = seed_identity()
      seed_membership(victim, ctx.server, [:read_messages, :send_messages])
      {:ok, _, _socket} = join_channel(victim, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      {:ok, _kick} =
        Servers.kick_member(%{server_id: ctx.server.id, identity_id: victim.identity.id},
          actor: owner.identity
        )

      victim_did = String.replace_prefix(victim.did, "did:yawp:", "")
      assert_push "removed", %{reason: "kicked", did: ^victim_did}
    end

    test "a kick of another member does not push removed to a different member's socket", ctx do
      owner = seed_identity()

      {:ok, _} =
        ctx.server
        |> Ash.Changeset.for_update(:set_owner, %{owner_did: owner.did})
        |> Ash.update(authorize?: false)

      seed_membership(owner, ctx.server, [])

      bystander = seed_identity()
      seed_membership(bystander, ctx.server, [:read_messages, :send_messages])
      {:ok, _, _socket} = join_channel(bystander, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      victim = seed_identity()
      seed_membership(victim, ctx.server, [:read_messages, :send_messages])

      {:ok, _kick} =
        Servers.kick_member(%{server_id: ctx.server.id, identity_id: victim.identity.id},
          actor: owner.identity
        )

      refute_push "removed", _
    end
  end

  describe "delete_message" do
    setup ctx do
      actor = seed_identity()
      seed_membership(actor, ctx.server, [:read_messages, :send_messages])
      {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ref = push(socket, "send_message", send_payload(ctx.channel, actor, "secret"))
      assert_reply ref, :ok, %{id: message_id}

      Map.merge(ctx, %{actor: actor, socket: socket, message_id: message_id})
    end

    defp delete_payload(message_id, actor, reason, ts) do
      envelope = %{
        "message_id" => message_id,
        "reason" => reason,
        "actor_did" => actor.did,
        "ts" => ts
      }

      %{
        "message_id" => message_id,
        "reason" => reason,
        "actor_did" => actor.did,
        "signed_by" => actor.device_id,
        "signature" => sign(envelope, actor.device_sk),
        "ts" => ts
      }
    end

    test "author can delete and message_deleted is broadcast and the body is wiped", ctx do
      ts = System.system_time(:millisecond)

      ref =
        push(
          ctx.socket,
          "delete_message",
          delete_payload(ctx.message_id, ctx.actor, "sender", ts)
        )

      mid = ctx.message_id
      assert_reply ref, :ok, %{message_id: ^mid, reason: "sender"}
      assert_broadcast "message_deleted", %{message_id: ^mid, reason: "sender"}

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel.id)
      assert is_nil(message.body)
    end

    test "moderator with manage_messages can delete another user's message", ctx do
      moderator = seed_identity()
      seed_membership(moderator, ctx.server, [:read_messages, :manage_messages])
      {:ok, _, mod_socket} = join_channel(moderator, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ts = System.system_time(:millisecond)

      ref =
        push(
          mod_socket,
          "delete_message",
          delete_payload(ctx.message_id, moderator, "moderator", ts)
        )

      mid = ctx.message_id
      assert_reply ref, :ok, %{message_id: ^mid, reason: "moderator"}
      assert_broadcast "message_deleted", %{message_id: ^mid}
    end

    test "non-moderator cannot delete another user's message", ctx do
      member = seed_identity()
      seed_membership(member, ctx.server, [:read_messages, :send_messages])
      {:ok, _, member_socket} = join_channel(member, ctx.server, ctx.channel)
      assert_push "history", _
      assert_push "presence_state", _

      ts = System.system_time(:millisecond)

      ref =
        push(
          member_socket,
          "delete_message",
          delete_payload(ctx.message_id, member, "moderator", ts)
        )

      assert_reply ref, :error, %{reason: _}
      refute_broadcast "message_deleted", _

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel.id)
      assert message.body == "secret"
    end

    test "author cannot delete their message from a different channel topic", ctx do
      {:ok, other_channel} =
        Servers.create_channel(
          %{server_id: ctx.server.id, name: "other", type: :text},
          authorize?: false
        )

      {:ok, _, other_socket} = join_channel(ctx.actor, ctx.server, other_channel)
      assert_push "history", _
      assert_push "presence_state", _

      ts = System.system_time(:millisecond)

      ref =
        push(
          other_socket,
          "delete_message",
          delete_payload(ctx.message_id, ctx.actor, "sender", ts)
        )

      assert_reply ref, :error, %{reason: "unauthorized"}
      refute_broadcast "message_deleted", _

      {:ok, [message]} = Servers.list_channel_messages(ctx.channel.id)
      assert message.body == "secret"
    end
  end
end
