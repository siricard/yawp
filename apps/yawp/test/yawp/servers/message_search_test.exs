defmodule Yawp.Servers.MessageSearchTest do
  use Yawp.DataCase, async: false

  import Bitwise

  require Ash.Query

  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  test "search_messages/3 returns only readable channel hits" do
    %{server: server, admin: admin, member: member, private_channel: private_channel} =
      seed_graph()

    insert_message(private_channel.id, admin.identity.did, "private narwhal briefing")

    assert {:ok, []} = Servers.search_messages(server.id, "narwhal", actor: member.identity)
    assert {:ok, [hit]} = Servers.search_messages(server.id, "narwhal", actor: admin.identity)
    assert hit.body == "private narwhal briefing"
  end

  test "search_messages/3 respects history-on-join" do
    %{server: server, admin: admin, public_channel: public_channel} = seed_graph()
    member = seed_identity()
    insert_message(public_channel.id, admin.identity.did, "ancient badger note")
    :timer.sleep(2)
    seed_membership(member, server, [:read_messages])

    assert {:ok, []} = Servers.search_messages(server.id, "badger", actor: member.identity)

    seed_membership(member, server, [:read_messages, :read_history_before_join])
    assert {:ok, [hit]} = Servers.search_messages(server.id, "badger", actor: member.identity)
    assert hit.body == "ancient badger note"
  end

  test "search_messages/3 filters visibility before trimming ranked results" do
    %{
      server: server,
      admin: admin,
      member: member,
      private_channel: private_channel,
      public_channel: public_channel
    } =
      seed_graph()

    readable = insert_message(public_channel.id, admin.identity.did, "crowded-result readable")

    Enum.each(1..60, fn index ->
      body = String.duplicate("crowded-result ", 8) <> Integer.to_string(index)
      insert_message(private_channel.id, admin.identity.did, body)
    end)

    assert readable.id not in raw_limited_match_ids(server.id, "crowded-result", 50)

    assert {:ok, [hit]} =
             Servers.search_messages(server.id, "crowded-result", actor: member.identity)

    assert hit.body == "crowded-result readable"
  end

  test "message search vector is maintained by postgres" do
    %{admin: admin, public_channel: public_channel} = seed_graph()
    message = insert_message(public_channel.id, admin.identity.did, "otter lighthouse")

    assert %{rows: [[true]]} =
             Repo.query!(
               "select search_vector @@ websearch_to_tsquery('simple', $1) from server_messages where id::text = $2",
               ["otter", message.id]
             )

    Repo.query!("update server_messages set body = $1 where id::text = $2", [
      "falcon tower",
      message.id
    ])

    assert %{rows: [[true, false]]} =
             Repo.query!(
               "select search_vector @@ websearch_to_tsquery('simple', $1), search_vector @@ websearch_to_tsquery('simple', $2) from server_messages where id::text = $3",
               ["falcon", "otter", message.id]
             )
  end

  defp seed_graph do
    {:ok, server} = Servers.create_server("Yawp")
    admin = seed_identity()
    member = seed_identity()

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
        permission_bits: Permissions.bit(:read_messages),
        position: 1
      })

    {:ok, public_channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    {:ok, private_channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "ops", type: :text, visibility: :private},
        authorize?: false
      )

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: admin.identity.id,
      server_id: server.id,
      role_ids: [admin_role.id],
      kind: :anchored
    })

    Ash.Seed.seed!(Yawp.Servers.Membership, %{
      identity_id: member.identity.id,
      server_id: server.id,
      role_ids: [member_role.id],
      kind: :anchored
    })

    Servers.create_channel_override(%{
      channel_id: private_channel.id,
      role_id: member_role.id,
      allow_bits: 0,
      deny_bits: Permissions.bit(:read_messages)
    })

    %{
      server: server,
      admin: admin,
      member: member,
      public_channel: public_channel,
      private_channel: private_channel
    }
  end

  defp seed_identity do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    %{identity: Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})}
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

    case membership(actor.identity.id, server.id) do
      nil ->
        Ash.Seed.seed!(Yawp.Servers.Membership, %{
          identity_id: actor.identity.id,
          server_id: server.id,
          role_ids: [role.id],
          kind: :anchored
        })

      existing ->
        existing
        |> Ash.Changeset.for_update(:set_roles, %{role_ids: [role.id]})
        |> Ash.update!(authorize?: false)
    end
  end

  defp membership(identity_id, server_id) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> List.first()
  end

  defp insert_message(channel_id, sender_did, body) do
    Ash.Seed.seed!(Yawp.Servers.Message, %{
      channel_id: channel_id,
      sender_did: sender_did,
      body: body,
      mentions: [],
      attachments: [],
      sender_signature: :crypto.strong_rand_bytes(64),
      signed_by: Ecto.UUID.generate(),
      server_serial: System.unique_integer([:positive]),
      server_inserted_at: DateTime.utc_now()
    })
  end

  defp raw_limited_match_ids(server_id, query, limit) do
    %{rows: rows} =
      Repo.query!(
        """
        select m.id
        from server_messages m
        join server_channels c on c.id = m.channel_id
        where c.server_id::text = $1
          and m.search_vector @@ websearch_to_tsquery('simple', $2)
        order by ts_rank(m.search_vector, websearch_to_tsquery('simple', $2)) desc,
                 m.server_inserted_at desc
        limit $3
        """,
        [server_id, query, limit]
      )

    Enum.map(rows, fn [id] -> Ecto.UUID.load!(id) end)
  end
end
