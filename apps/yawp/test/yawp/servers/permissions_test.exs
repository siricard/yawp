defmodule Yawp.Servers.PermissionsTest do
  use Yawp.DataCase, async: false

  import Bitwise

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  defp make_identity do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp seed_server do
    {:ok, server} = Servers.create_server("Yawp")

    {:ok, owner_role} =
      Servers.create_role(%{
        server_id: server.id,
        name: "Owner",
        system: true,
        permission_bits: Permissions.owner_bits(),
        position: 100
      })

    {:ok, admin_role} =
      Servers.create_role(%{
        server_id: server.id,
        name: "Admin",
        system: true,
        permission_bits: Permissions.admin_bits(),
        position: 50
      })

    {:ok, member_role} =
      Servers.create_role(%{
        server_id: server.id,
        name: "Member",
        system: true,
        permission_bits: Permissions.member_bits(),
        position: 1
      })

    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    %{
      server: server,
      owner_role: owner_role,
      admin_role: admin_role,
      member_role: member_role,
      channel: channel
    }
  end

  describe "permission-bit registry" do
    test "every named bit is a distinct power of two" do
      values = Enum.map(Permissions.names(), &Permissions.bit/1)

      assert length(values) == 16
      assert Enum.uniq(values) == values

      assert Enum.all?(values, fn v -> v > 0 and (v &&& v - 1) == 0 end)
    end

    test "all_bits/0 is the OR of every named bit" do
      expected =
        Permissions.names()
        |> Enum.map(&Permissions.bit/1)
        |> Enum.reduce(0, &(&1 ||| &2))

      assert Permissions.all_bits() == expected
    end

    test "owner-only bits cover delete_server and transfer_ownership" do
      owner_only = Permissions.owner_only_bits()

      assert (owner_only &&& Permissions.bit(:delete_server)) != 0
      assert (owner_only &&& Permissions.bit(:transfer_ownership)) != 0
    end

    test "registry includes the ADR 021 mention amendment bits" do
      assert :mention_everyone in Permissions.names()
      assert :mention_role in Permissions.names()
    end

    test "registry includes the M8 voice placeholder bits" do
      assert :voice_speak in Permissions.names()
      assert :voice_listen in Permissions.names()
    end

    test "has?/2 tests membership of a bit in a mask" do
      mask = Permissions.bit(:read_messages) ||| Permissions.bit(:send_messages)

      assert Permissions.has?(mask, :read_messages)
      assert Permissions.has?(mask, :send_messages)
      refute Permissions.has?(mask, :ban_members)
    end

    test "seeded Admin set is all bits except the owner-only ones" do
      assert Permissions.admin_bits() ==
               (Permissions.all_bits() &&& bnot(Permissions.owner_only_bits()))
    end

    test "seeded Member set has read/send but not moderation or mention-broadcast bits" do
      member = Permissions.member_bits()

      assert Permissions.has?(member, :read_messages)
      assert Permissions.has?(member, :send_messages)
      refute Permissions.has?(member, :ban_members)
      refute Permissions.has?(member, :kick_members)
      refute Permissions.has?(member, :manage_roles)
      refute Permissions.has?(member, :mention_everyone)
      refute Permissions.has?(member, :mention_role)
    end
  end

  describe "effective_bits/3 — owner short-circuit" do
    test "the server owner gets all bits regardless of channel or membership" do
      %{server: server, channel: channel} = seed_server()
      owner = make_identity()

      {:ok, server} = Servers.set_server_owner(server, owner.did)

      assert Permissions.effective_bits(owner, server, nil) == Permissions.all_bits()
      assert Permissions.effective_bits(owner, server, channel) == Permissions.all_bits()
    end
  end

  describe "effective_bits/3 — banned and kicked short-circuit" do
    test "a banned member resolves to 0 even with a role granting bits" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()

      Ash.Seed.seed!(Yawp.Servers.Membership, %{
        identity_id: identity.id,
        server_id: server.id,
        role_ids: [member_role.id],
        banned: true
      })

      assert Permissions.effective_bits(identity, server, channel) == 0
    end

    test "a kicked member resolves to 0" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()

      Ash.Seed.seed!(Yawp.Servers.Membership, %{
        identity_id: identity.id,
        server_id: server.id,
        role_ids: [member_role.id],
        kicked: true
      })

      assert Permissions.effective_bits(identity, server, channel) == 0
    end
  end

  describe "effective_bits/3 — non-member" do
    test "an identity with no membership resolves to 0" do
      %{server: server, channel: channel} = seed_server()
      stranger = make_identity()

      assert Permissions.effective_bits(stranger, server, channel) == 0
    end
  end

  describe "effective_bits/3 — server-role baseline" do
    test "member role bits apply at the server level (no channel)" do
      %{server: server, member_role: member_role} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      assert Permissions.effective_bits(identity, server, nil) == Permissions.member_bits()
    end

    test "admin role bits apply across a channel with no overrides" do
      %{server: server, admin_role: admin_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [admin_role.id])

      assert Permissions.effective_bits(identity, server, channel) == Permissions.admin_bits()
    end

    test "multiple roles union their bits" do
      %{server: server, member_role: member_role, admin_role: admin_role} = seed_server()
      identity = make_identity()

      {:ok, _m} =
        Servers.assign_role(identity.id, server.id, [member_role.id, admin_role.id])

      expected = Permissions.member_bits() ||| Permissions.admin_bits()
      assert Permissions.effective_bits(identity, server, nil) == expected
    end
  end

  describe "effective_bits/3 — channel overrides" do
    test "a role-level allow override grants a bit the role lacks" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _ov} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          allow_bits: Permissions.bit(:manage_messages),
          deny_bits: 0
        })

      effective = Permissions.effective_bits(identity, server, channel)
      assert Permissions.has?(effective, :manage_messages)
      assert Permissions.has?(effective, :read_messages)
    end

    test "a role-level deny override removes a bit the role grants" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _ov} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          allow_bits: 0,
          deny_bits: Permissions.bit(:send_messages)
        })

      effective = Permissions.effective_bits(identity, server, channel)
      refute Permissions.has?(effective, :send_messages)
      assert Permissions.has?(effective, :read_messages)
    end

    test "an identity-level allow override grants access to a private channel" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _deny_everyone} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          allow_bits: 0,
          deny_bits: Permissions.bit(:read_messages)
        })

      {:ok, _grant} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          identity_id: identity.id,
          allow_bits: Permissions.bit(:read_messages),
          deny_bits: 0
        })

      effective = Permissions.effective_bits(identity, server, channel)
      assert Permissions.has?(effective, :read_messages)
    end

    test "within one tier, deny wins when a single override both allows and denies a bit" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _ov} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          allow_bits: Permissions.bit(:manage_channels),
          deny_bits: Permissions.bit(:manage_channels)
        })

      effective = Permissions.effective_bits(identity, server, channel)
      refute Permissions.has?(effective, :manage_channels)
    end

    test "an identity-tier allow beats a role-tier deny on the same bit" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()
      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _role_deny} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          role_id: member_role.id,
          allow_bits: 0,
          deny_bits: Permissions.bit(:send_messages)
        })

      {:ok, _identity_allow} =
        Servers.create_channel_override(%{
          channel_id: channel.id,
          identity_id: identity.id,
          allow_bits: Permissions.bit(:send_messages),
          deny_bits: 0
        })

      effective = Permissions.effective_bits(identity, server, channel)
      assert Permissions.has?(effective, :send_messages)
    end

    test "a role id belonging to another server grants zero bits" do
      %{server: server, channel: channel} = seed_server()
      other = seed_server()
      identity = make_identity()

      Ash.Seed.seed!(Yawp.Servers.Membership, %{
        identity_id: identity.id,
        server_id: server.id,
        role_ids: [other.admin_role.id]
      })

      assert Permissions.effective_bits(identity, server, nil) == 0
      assert Permissions.effective_bits(identity, server, channel) == 0
    end

    test "overrides on a different channel do not leak into this channel" do
      %{server: server, member_role: member_role, channel: channel} = seed_server()

      {:ok, other_channel} =
        Servers.create_channel(
          %{server_id: server.id, name: "other", type: :text},
          authorize?: false
        )

      identity = make_identity()
      {:ok, _m} = Servers.assign_role(identity.id, server.id, [member_role.id])

      {:ok, _ov} =
        Servers.create_channel_override(%{
          channel_id: other_channel.id,
          role_id: member_role.id,
          allow_bits: Permissions.bit(:manage_messages),
          deny_bits: 0
        })

      effective = Permissions.effective_bits(identity, server, channel)
      refute Permissions.has?(effective, :manage_messages)
    end
  end
end
