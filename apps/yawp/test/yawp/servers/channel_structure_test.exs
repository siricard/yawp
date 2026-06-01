defmodule Yawp.Servers.ChannelStructureTest do
  use Yawp.DataCase, async: false

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

    %{server: server, admin_role: admin_role, member_role: member_role}
  end

  defp member_of(server, role) do
    identity = make_identity()
    {:ok, _m} = Servers.assign_role(identity.id, server.id, [role.id])
    identity
  end

  describe "Category resource" do
    test "create_category/1 inserts a top-level category" do
      %{server: server} = seed_server()

      {:ok, category} =
        Servers.create_category(%{server_id: server.id, name: "Text Channels"})

      assert category.server_id == server.id
      assert category.name == "Text Channels"
      assert category.parent_id == nil
      assert category.position == 0
    end

    test "create_category/1 accepts an explicit position" do
      %{server: server} = seed_server()

      {:ok, category} =
        Servers.create_category(%{server_id: server.id, name: "Off Topic", position: 3})

      assert category.position == 3
    end

    test "create_category/1 allows a child whose parent is top-level (depth 1)" do
      %{server: server} = seed_server()
      {:ok, parent} = Servers.create_category(%{server_id: server.id, name: "Parent"})

      {:ok, child} =
        Servers.create_category(%{
          server_id: server.id,
          name: "Child",
          parent_id: parent.id
        })

      assert child.parent_id == parent.id
    end

    test "create_category/1 rejects nesting deeper than one level" do
      %{server: server} = seed_server()
      {:ok, parent} = Servers.create_category(%{server_id: server.id, name: "Parent"})

      {:ok, child} =
        Servers.create_category(%{
          server_id: server.id,
          name: "Child",
          parent_id: parent.id
        })

      assert {:error, _err} =
               Servers.create_category(%{
                 server_id: server.id,
                 name: "Grandchild",
                 parent_id: child.id
               })
    end

    test "unique_server_id_name identity rejects duplicate category names" do
      %{server: server} = seed_server()
      {:ok, _c} = Servers.create_category(%{server_id: server.id, name: "Dupe"})

      assert {:error, _err} =
               Servers.create_category(%{server_id: server.id, name: "Dupe"})
    end
  end

  describe "Channel structure attributes" do
    test "create_channel/1 defaults position, visibility, join_policy and nil category" do
      %{server: server} = seed_server()

      {:ok, channel} =
        Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

      assert channel.position == 0
      assert channel.visibility == :server_public
      assert channel.join_policy == :invite_only
      assert channel.category_id == nil
    end

    test "create_channel/1 accepts a category, position, visibility and join_policy" do
      %{server: server} = seed_server()
      {:ok, category} = Servers.create_category(%{server_id: server.id, name: "Text"})

      {:ok, channel} =
        Servers.create_channel(%{
          server_id: server.id,
          category_id: category.id,
          name: "general",
          type: :text,
          position: 2,
          visibility: :private,
          join_policy: :open
        })

      assert channel.category_id == category.id
      assert channel.position == 2
      assert channel.visibility == :private
      assert channel.join_policy == :open
    end

    test "create_channel/1 rejects an unknown visibility" do
      %{server: server} = seed_server()

      assert {:error, _err} =
               Servers.create_channel(%{
                 server_id: server.id,
                 name: "x",
                 type: :text,
                 visibility: :nope
               })
    end
  end

  describe "recategorize_channel/2" do
    test "moves a channel into a category and sets its position" do
      %{server: server} = seed_server()
      {:ok, category} = Servers.create_category(%{server_id: server.id, name: "Text"})

      {:ok, channel} =
        Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

      {:ok, moved} =
        Servers.recategorize_channel(channel, %{category_id: category.id, position: 5})

      assert moved.category_id == category.id
      assert moved.position == 5
    end

    test "moves a channel out of any category when category_id is nil" do
      %{server: server} = seed_server()
      {:ok, category} = Servers.create_category(%{server_id: server.id, name: "Text"})

      {:ok, channel} =
        Servers.create_channel(%{
          server_id: server.id,
          category_id: category.id,
          name: "general",
          type: :text
        })

      {:ok, moved} = Servers.recategorize_channel(channel, %{category_id: nil})
      assert moved.category_id == nil
    end
  end

  describe "reorder_channels/1" do
    test "assigns positions in the supplied order" do
      %{server: server} = seed_server()
      {:ok, a} = Servers.create_channel(%{server_id: server.id, name: "a", type: :text})
      {:ok, b} = Servers.create_channel(%{server_id: server.id, name: "b", type: :text})
      {:ok, c} = Servers.create_channel(%{server_id: server.id, name: "c", type: :text})

      {:ok, _} =
        Servers.reorder_channels(%{server_id: server.id, ordered_ids: [c.id, a.id, b.id]})

      positions =
        Yawp.Servers.Channel
        |> Ash.read!(authorize?: false)
        |> Map.new(&{&1.name, &1.position})

      assert positions["c"] == 0
      assert positions["a"] == 1
      assert positions["b"] == 2
    end
  end

  describe "reorder_categories/1" do
    test "assigns positions in the supplied order" do
      %{server: server} = seed_server()
      {:ok, a} = Servers.create_category(%{server_id: server.id, name: "a"})
      {:ok, b} = Servers.create_category(%{server_id: server.id, name: "b"})

      {:ok, _} =
        Servers.reorder_categories(%{server_id: server.id, ordered_ids: [b.id, a.id]})

      positions =
        Yawp.Servers.Category
        |> Ash.read!(authorize?: false)
        |> Map.new(&{&1.name, &1.position})

      assert positions["b"] == 0
      assert positions["a"] == 1
    end
  end

  describe "manage_channels gating" do
    test "an actor without manage_channels cannot create a channel" do
      %{server: server, member_role: member_role} = seed_server()
      member = member_of(server, member_role)

      refute Permissions.has?(
               Permissions.effective_bits(member, server, nil),
               :manage_channels
             )

      assert {:error, _err} =
               Servers.create_channel(
                 %{server_id: server.id, name: "blocked", type: :text},
                 actor: member
               )
    end

    test "an admin actor (manage_channels) can create a channel" do
      %{server: server, admin_role: admin_role} = seed_server()
      admin = member_of(server, admin_role)

      {:ok, channel} =
        Servers.create_channel(
          %{server_id: server.id, name: "ok", type: :text},
          actor: admin
        )

      assert channel.name == "ok"
    end

    test "an actor without manage_channels cannot create a category" do
      %{server: server, member_role: member_role} = seed_server()
      member = member_of(server, member_role)

      assert {:error, _err} =
               Servers.create_category(
                 %{server_id: server.id, name: "blocked"},
                 actor: member
               )
    end

    test "an actor without manage_channels cannot reorder channels" do
      %{server: server, member_role: member_role} = seed_server()
      member = member_of(server, member_role)
      {:ok, a} = Servers.create_channel(%{server_id: server.id, name: "a", type: :text})

      assert {:error, _err} =
               Servers.reorder_channels(
                 %{server_id: server.id, ordered_ids: [a.id]},
                 actor: member
               )
    end

    test "an actor without manage_channels cannot recategorize a channel" do
      %{server: server, member_role: member_role} = seed_server()
      member = member_of(server, member_role)
      {:ok, category} = Servers.create_category(%{server_id: server.id, name: "Text"})

      {:ok, channel} =
        Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

      assert {:error, _err} =
               Servers.recategorize_channel(
                 channel,
                 %{category_id: category.id},
                 actor: member
               )
    end

    test "an admin actor can recategorize a channel" do
      %{server: server, admin_role: admin_role} = seed_server()
      admin = member_of(server, admin_role)
      {:ok, category} = Servers.create_category(%{server_id: server.id, name: "Text"})

      {:ok, channel} =
        Servers.create_channel(%{server_id: server.id, name: "general", type: :text})

      {:ok, moved} =
        Servers.recategorize_channel(
          channel,
          %{category_id: category.id},
          actor: admin
        )

      assert moved.category_id == category.id
    end
  end
end
