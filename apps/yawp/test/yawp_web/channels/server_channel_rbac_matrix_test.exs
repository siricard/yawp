defmodule YawpWeb.ServerChannelRbacMatrixTest do
  @moduledoc """
  Role-tier × permission-graph matrix over the live channel transport plus
  the moderation actions a member sheet drives.

  Each role tier (Owner / Admin / Member / Guest) is exercised against the
  join → send → edit → delete → kick → ban path, layered with channel
  allow / deny / identity overrides. The channel events run over the real
  `ServerChannelTopic`; kick/ban run through the `:kick` / `:ban` actions
  the moderation sheet calls, gated by the same effective-bits resolver.
  """
  use YawpWeb.ChannelCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  require Ash.Query

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

  defp bits_for(:owner), do: Permissions.owner_bits()
  defp bits_for(:admin), do: Permissions.admin_bits()
  defp bits_for(:member), do: Permissions.member_bits()
  defp bits_for(:guest), do: Permissions.bit(:read_messages)

  defp seed_role(server, tier) do
    Ash.Seed.seed!(Yawp.Servers.Role, %{
      server_id: server.id,
      name: "#{tier}-#{Ecto.UUID.generate()}",
      system: false,
      permission_bits: bits_for(tier),
      position: 0
    })
  end

  defp seed_tier(server, tier, opts \\ []) do
    actor = seed_identity()

    if tier == :owner do
      {:ok, _} =
        server
        |> Ash.Changeset.for_update(:set_owner, %{owner_did: actor.did})
        |> Ash.update(authorize?: false)
    end

    role = seed_role(server, tier)

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: actor.identity.id,
      server_id: server.id,
      role_ids: [role.id],
      kind: Keyword.get(opts, :kind, :anchored)
    })

    Map.put(actor, :role, role)
  end

  defp override(channel, attrs) do
    Ash.Seed.seed!(
      Yawp.Servers.ChannelOverride,
      Map.merge(%{channel_id: channel.id, allow_bits: 0, deny_bits: 0}, Map.new(attrs))
    )
  end

  defp topic(server, channel), do: "server:#{server.id}:channel:#{channel.id}"

  defp join_channel(actor, server, channel) do
    YawpWeb.UserSocket
    |> Phoenix.ChannelTest.socket(
      "identity_socket:#{actor.identity.id}-#{System.unique_integer([:positive])}",
      %{current_identity: actor.identity}
    )
    |> subscribe_and_join(YawpWeb.ServerChannelTopic, topic(server, channel))
  end

  defp drain_join(socket) do
    assert_push "history", _
    assert_push "presence_state", _
    socket
  end

  defp sign(map, device_sk) do
    sig = :crypto.sign(:eddsa, :none, Yawp.CanonicalJson.encode(map), [device_sk, :ed25519])
    Base.url_encode64(sig, padding: false)
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

  defp edit_payload(message_id, actor, body) do
    ts = System.system_time(:millisecond)
    envelope = %{"message_id" => message_id, "body" => body, "ts" => ts}

    %{
      "message_id" => message_id,
      "body" => body,
      "signed_by" => actor.device_id,
      "signature" => sign(envelope, actor.device_sk),
      "ts" => ts
    }
  end

  defp delete_payload(message_id, actor, reason) do
    ts = System.system_time(:millisecond)

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

  defp post_message(actor, server, channel, body) do
    {:ok, _, socket} = join_channel(actor, server, channel)
    drain_join(socket)
    ref = push(socket, "send_message", send_payload(channel, actor, body))
    assert_reply ref, :ok, %{id: id}
    {socket, id}
  end

  defp error_type(error) do
    cond do
      is_struct(error, Yawp.RpcError) ->
        to_string(error.type)

      is_struct(error, Ash.Error.Invalid) or is_struct(error, Ash.Error.Forbidden) ->
        Enum.find_value(error.errors, fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      true ->
        nil
    end
  end

  describe "join — read_messages gate per tier" do
    test "owner / admin / member / guest all join (each holds read_messages)", ctx do
      for tier <- [:owner, :admin, :member, :guest] do
        actor = seed_tier(ctx.server, tier)
        assert {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
        drain_join(socket)
      end
    end

    test "a role-level deny of read_messages closes the channel to a member", ctx do
      actor = seed_tier(ctx.server, :member)
      override(ctx.channel, role_id: actor.role.id, deny_bits: Permissions.bit(:read_messages))

      assert {:error, %{reason: "unauthorized"}} =
               join_channel(actor, ctx.server, ctx.channel)
    end

    test "an identity-level allow re-opens a channel a role-deny had closed", ctx do
      actor = seed_tier(ctx.server, :member)
      override(ctx.channel, role_id: actor.role.id, deny_bits: Permissions.bit(:read_messages))

      override(ctx.channel,
        identity_id: actor.identity.id,
        allow_bits: Permissions.bit(:read_messages)
      )

      assert {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
      drain_join(socket)
    end

    test "a banned member is rejected even with read_messages", ctx do
      actor = seed_tier(ctx.server, :member)

      membership(actor, ctx.server)
      |> Ash.Changeset.for_update(:set_moderation, %{banned: true})
      |> Ash.update!(authorize?: false)

      assert {:error, %{reason: "unauthorized"}} =
               join_channel(actor, ctx.server, ctx.channel)
    end
  end

  describe "send_message — send_messages gate per tier" do
    test "owner / admin / member with send_messages each broadcast", ctx do
      for tier <- [:owner, :admin, :member] do
        actor = seed_tier(ctx.server, tier)
        {:ok, _, socket} = join_channel(actor, ctx.server, ctx.channel)
        drain_join(socket)
        ref = push(socket, "send_message", send_payload(ctx.channel, actor, "hi-#{tier}"))
        assert_reply ref, :ok, %{server_serial: serial}
        assert serial >= 1
        assert_broadcast "new_message", %{body: <<"hi-"::binary, _::binary>>}
      end
    end

    test "a guest without send_messages is denied and nothing is broadcast", ctx do
      guest = seed_tier(ctx.server, :guest)
      {:ok, _, gsocket} = join_channel(guest, ctx.server, ctx.channel)
      drain_join(gsocket)
      ref = push(gsocket, "send_message", send_payload(ctx.channel, guest, "nope"))
      assert_reply ref, :error, %{reason: "unauthorized"}
      refute_broadcast "new_message", _
    end

    test "a channel allow override grants send to a guest who lacks it by role", ctx do
      guest = seed_tier(ctx.server, :guest)
      override(ctx.channel, role_id: guest.role.id, allow_bits: Permissions.bit(:send_messages))

      {:ok, _, socket} = join_channel(guest, ctx.server, ctx.channel)
      drain_join(socket)
      ref = push(socket, "send_message", send_payload(ctx.channel, guest, "granted"))
      assert_reply ref, :ok, %{body: "granted"}
    end

    test "a channel deny override strips send from a member who has it by role", ctx do
      member = seed_tier(ctx.server, :member)
      override(ctx.channel, role_id: member.role.id, deny_bits: Permissions.bit(:send_messages))

      {:ok, _, socket} = join_channel(member, ctx.server, ctx.channel)
      drain_join(socket)
      ref = push(socket, "send_message", send_payload(ctx.channel, member, "blocked"))
      assert_reply ref, :error, %{reason: "unauthorized"}
      refute_broadcast "new_message", _
    end

    test "a tampered signature is rejected regardless of tier", ctx do
      member = seed_tier(ctx.server, :member)
      {:ok, _, socket} = join_channel(member, ctx.server, ctx.channel)
      drain_join(socket)

      payload = send_payload(ctx.channel, member, "real")
      ref = push(socket, "send_message", Map.put(payload, "body", "tampered"))
      assert_reply ref, :error, %{reason: "invalid_signature"}
      refute_broadcast "new_message", _
    end
  end

  describe "edit_message — author-only" do
    test "the author edits their own message", ctx do
      member = seed_tier(ctx.server, :member)
      {socket, mid} = post_message(member, ctx.server, ctx.channel, "v1")

      ref = push(socket, "edit_message", edit_payload(mid, member, "v2"))
      assert_reply ref, :ok, %{message_id: ^mid, body: "v2", edit_serial: 1}
      assert_broadcast "message_edited", %{message_id: ^mid, body: "v2"}
    end

    test "an admin cannot edit another member's message", ctx do
      member = seed_tier(ctx.server, :member)
      {_socket, mid} = post_message(member, ctx.server, ctx.channel, "owned")

      admin = seed_tier(ctx.server, :admin)
      {:ok, _, asocket} = join_channel(admin, ctx.server, ctx.channel)
      drain_join(asocket)

      ref = push(asocket, "edit_message", edit_payload(mid, admin, "hijack"))
      assert_reply ref, :error, %{reason: _}
      refute_broadcast "message_edited", _
    end
  end

  describe "delete_message — own message or manage_messages" do
    test "the author deletes their own message and the body is wiped", ctx do
      member = seed_tier(ctx.server, :member)
      {socket, mid} = post_message(member, ctx.server, ctx.channel, "secret")

      ref = push(socket, "delete_message", delete_payload(mid, member, "sender"))
      assert_reply ref, :ok, %{message_id: ^mid, reason: "sender"}
      assert_broadcast "message_deleted", %{message_id: ^mid}

      {:ok, [stored]} = Servers.list_channel_messages(ctx.channel.id)
      assert is_nil(stored.body)
    end

    test "an admin (manage_messages) deletes another member's message", ctx do
      member = seed_tier(ctx.server, :member)
      {_socket, mid} = post_message(member, ctx.server, ctx.channel, "spam")

      admin = seed_tier(ctx.server, :admin)
      {:ok, _, asocket} = join_channel(admin, ctx.server, ctx.channel)
      drain_join(asocket)

      ref = push(asocket, "delete_message", delete_payload(mid, admin, "moderator"))
      assert_reply ref, :ok, %{message_id: ^mid, reason: "moderator"}
      assert_broadcast "message_deleted", %{message_id: ^mid}
    end

    test "a plain member cannot delete another member's message", ctx do
      author = seed_tier(ctx.server, :member)
      {_socket, mid} = post_message(author, ctx.server, ctx.channel, "keep")

      member = seed_tier(ctx.server, :member)
      {:ok, _, msocket} = join_channel(member, ctx.server, ctx.channel)
      drain_join(msocket)

      ref = push(msocket, "delete_message", delete_payload(mid, member, "moderator"))
      assert_reply ref, :error, %{reason: _}
      refute_broadcast "message_deleted", _

      {:ok, [stored]} = Servers.list_channel_messages(ctx.channel.id)
      assert stored.body == "keep"
    end

    test "a channel allow override lets a member moderate-delete in that channel", ctx do
      author = seed_tier(ctx.server, :member)
      {_socket, mid} = post_message(author, ctx.server, ctx.channel, "removable")

      mod = seed_tier(ctx.server, :member)
      override(ctx.channel, role_id: mod.role.id, allow_bits: Permissions.bit(:manage_messages))

      {:ok, _, msocket} = join_channel(mod, ctx.server, ctx.channel)
      drain_join(msocket)

      ref = push(msocket, "delete_message", delete_payload(mid, mod, "moderator"))
      assert_reply ref, :ok, %{message_id: ^mid}
    end
  end

  describe "kick — kick_members gate per tier" do
    setup ctx do
      victim = seed_tier(ctx.server, :member)
      Map.put(ctx, :victim, victim)
    end

    test "owner and admin can kick a member", ctx do
      for tier <- [:owner, :admin] do
        target = seed_tier(ctx.server, :member)
        actor = seed_tier(ctx.server, tier)

        assert {:ok, kick} =
                 Servers.kick_member(
                   %{server_id: ctx.server.id, identity_id: target.identity.id},
                   actor: actor.identity
                 )

        assert kick.identity_id == target.identity.id
        assert membership(target, ctx.server).kicked == true
      end
    end

    test "a member cannot kick (missing_permission) and the target is untouched", ctx do
      actor = seed_tier(ctx.server, :member)

      assert {:error, error} =
               Servers.kick_member(
                 %{server_id: ctx.server.id, identity_id: ctx.victim.identity.id},
                 actor: actor.identity
               )

      assert error_type(error) == "missing_permission"
      assert membership(ctx.victim, ctx.server).kicked == false
    end

    test "a guest cannot kick (missing_permission)", ctx do
      actor = seed_tier(ctx.server, :guest)

      assert {:error, error} =
               Servers.kick_member(
                 %{server_id: ctx.server.id, identity_id: ctx.victim.identity.id},
                 actor: actor.identity
               )

      assert error_type(error) == "missing_permission"
    end

    test "a nil actor is rejected (not_authenticated)", ctx do
      assert {:error, error} =
               Servers.kick_member(%{
                 server_id: ctx.server.id,
                 identity_id: ctx.victim.identity.id
               })

      assert error_type(error) == "not_authenticated"
    end
  end

  describe "ban — ban_members gate per tier" do
    setup ctx do
      victim = seed_tier(ctx.server, :member)
      Map.put(ctx, :victim, victim)
    end

    test "owner and admin can ban a member; effective bits then resolve to 0", ctx do
      for tier <- [:owner, :admin] do
        target = seed_tier(ctx.server, :member)
        actor = seed_tier(ctx.server, tier)

        assert {:ok, _ban} =
                 Servers.ban_member(
                   %{server_id: ctx.server.id, identity_id: target.identity.id},
                   actor: actor.identity
                 )

        assert membership(target, ctx.server).banned == true
        assert Permissions.effective_bits(target.identity, ctx.server, ctx.channel) == 0
      end
    end

    test "a member cannot ban (missing_permission) and the target is untouched", ctx do
      actor = seed_tier(ctx.server, :member)

      assert {:error, error} =
               Servers.ban_member(
                 %{server_id: ctx.server.id, identity_id: ctx.victim.identity.id},
                 actor: actor.identity
               )

      assert error_type(error) == "missing_permission"
      assert membership(ctx.victim, ctx.server).banned == false
    end

    test "a guest cannot ban (missing_permission)", ctx do
      actor = seed_tier(ctx.server, :guest)

      assert {:error, error} =
               Servers.ban_member(
                 %{server_id: ctx.server.id, identity_id: ctx.victim.identity.id},
                 actor: actor.identity
               )

      assert error_type(error) == "missing_permission"
    end

    test "a banned member can no longer join the channel transport", ctx do
      target = seed_tier(ctx.server, :member)
      owner = seed_tier(ctx.server, :owner)

      assert {:ok, _, socket} = join_channel(target, ctx.server, ctx.channel)
      drain_join(socket)

      {:ok, _} =
        Servers.ban_member(%{server_id: ctx.server.id, identity_id: target.identity.id},
          actor: owner.identity
        )

      assert {:error, %{reason: "unauthorized"}} =
               join_channel(target, ctx.server, ctx.channel)
    end
  end

  defp membership(actor, server) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^actor.identity.id and server_id == ^server.id)
    |> Ash.read_one!(authorize?: false)
  end
end
