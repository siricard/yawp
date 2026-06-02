defmodule YawpWeb.ChannelStructureRpcAuthzTest do
  @moduledoc """
  An unauthenticated caller driving the channel/category mutation actions
  over the live `POST /rpc/run` endpoint must be refused — no bearer token
  means no actor, and the gated actions deny a nil actor on the wire even
  though trusted server-side callers may pass an explicit authorization
  bypass.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers

  require Ash.Query

  setup %{conn: conn} do
    :ok = Servers.Seeder.run()
    {:ok, server} = Servers.get_singleton_server()

    {:ok, channel} =
      Servers.Channel
      |> Ash.Query.filter(server_id == ^server.id and type == :text)
      |> Ash.read_one(authorize?: false)

    %{conn: conn, server: server, channel: channel}
  end

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp owner!(server) do
    owner = seed_identity!()
    {:ok, _} = Servers.set_server_owner(server, owner.did)
    {:ok, role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [role.id])
    owner
  end

  defp bearer(identity) do
    {:ok, %{session_token: session}} = Identity.issue_pair(identity.id, Ecto.UUID.generate())
    session.token
  end

  defp rpc(conn, action, input) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(~p"/rpc/run", %{"action" => action, "fields" => ["id"], "input" => input})
    |> json_response(200)
  end

  defp rpc_action(conn, action, input) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(~p"/rpc/run", %{"action" => action, "input" => input})
    |> json_response(200)
  end

  defp error_types(payload) do
    Enum.map(payload["errors"] || [], & &1["type"])
  end

  test "unauthenticated create_channel is refused", %{conn: conn, server: server} do
    payload =
      rpc(conn, "create_channel", %{
        "serverId" => server.id,
        "name" => "sneaky",
        "type" => "text"
      })

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)

    refute Servers.Channel
           |> Ash.read!(authorize?: false)
           |> Enum.any?(&(&1.name == "sneaky"))
  end

  test "unauthenticated create_category is refused", %{conn: conn, server: server} do
    payload =
      rpc(conn, "create_category", %{"serverId" => server.id, "name" => "sneaky-cat"})

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)

    refute Servers.Category
           |> Ash.read!(authorize?: false)
           |> Enum.any?(&(&1.name == "sneaky-cat"))
  end

  test "unauthenticated reorder_channels is refused", %{
    conn: conn,
    server: server,
    channel: channel
  } do
    payload =
      rpc_action(conn, "reorder_channels", %{
        "serverId" => server.id,
        "orderedIds" => [channel.id]
      })

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)
  end

  test "unauthenticated reorder_categories is refused", %{conn: conn, server: server} do
    {:ok, category} =
      Servers.create_category(%{server_id: server.id, name: "Cat"}, authorize?: false)

    payload =
      rpc_action(conn, "reorder_categories", %{
        "serverId" => server.id,
        "orderedIds" => [category.id]
      })

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)
  end

  test "unauthenticated recategorize_channel is refused", %{
    conn: conn,
    server: server,
    channel: channel
  } do
    {:ok, category} =
      Servers.create_category(%{server_id: server.id, name: "Cat"}, authorize?: false)

    payload =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/rpc/run", %{
        "action" => "recategorize_channel",
        "fields" => ["id"],
        "identity" => channel.id,
        "input" => %{"categoryId" => category.id}
      })
      |> json_response(200)

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)
  end

  test "unauthenticated destroy_channel is refused", %{conn: conn, channel: channel} do
    payload =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/rpc/run", %{
        "action" => "destroy_channel",
        "fields" => ["id"],
        "identity" => channel.id,
        "input" => %{}
      })
      |> json_response(200)

    assert payload["success"] == false
    assert "not_authenticated" in error_types(payload)

    assert Servers.Channel
           |> Ash.read!(authorize?: false)
           |> Enum.any?(&(&1.id == channel.id))
  end

  test "an owner reorder_channels over the wire persists the new positions", %{
    conn: conn,
    server: server,
    channel: seeded
  } do
    owner = owner!(server)

    {:ok, second} =
      Servers.create_channel(
        %{server_id: server.id, name: "second", type: :text},
        authorize?: false
      )

    {:ok, third} =
      Servers.create_channel(
        %{server_id: server.id, name: "third", type: :text},
        authorize?: false
      )

    payload =
      conn
      |> put_req_header("content-type", "application/json")
      |> put_req_header("authorization", "Bearer #{bearer(owner)}")
      |> post(~p"/rpc/run", %{
        "action" => "reorder_channels",
        "input" => %{
          "serverId" => server.id,
          "orderedIds" => [third.id, seeded.id, second.id]
        }
      })
      |> json_response(200)

    assert payload["success"] == true

    positions =
      Servers.Channel
      |> Ash.read!(authorize?: false)
      |> Map.new(&{&1.id, &1.position})

    assert positions[third.id] == 0
    assert positions[seeded.id] == 1
    assert positions[second.id] == 2
  end
end
