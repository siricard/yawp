defmodule YawpWeb.ChannelStructureRpcCreateTest do
  @moduledoc """
  An authenticated owner driving the channel/category create actions over
  the live `POST /rpc/run` endpoint persists real rows. This exercises the
  full Bearer-token → ChatSession plug → Ash actor → RequireManageChannels
  → DB path, not a mocked store.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers

  require Ash.Query

  setup %{conn: conn} do
    :ok = Servers.Seeder.run()
    {:ok, server} = Servers.get_singleton_server()

    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    owner = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
    {:ok, _} = Servers.set_server_owner(server, owner.did)
    {:ok, owner_role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [owner_role.id])

    {:ok, %{session_token: session}} =
      Identity.issue_pair(owner.id, Ecto.UUID.generate())

    authed = put_req_header(conn, "authorization", "Bearer #{session.token}")
    %{conn: authed, server: server, owner: owner}
  end

  defp rpc(conn, action, input) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(~p"/rpc/run", %{"action" => action, "fields" => ["id"], "input" => input})
    |> json_response(200)
  end

  test "authenticated owner create_channel persists a DB row", %{conn: conn, server: server} do
    payload =
      rpc(conn, "create_channel", %{
        "serverId" => server.id,
        "name" => "war-room",
        "type" => "text"
      })

    assert payload["success"] == true

    persisted =
      Servers.Channel
      |> Ash.Query.filter(server_id == ^server.id and name == "war-room")
      |> Ash.read!(authorize?: false)

    assert length(persisted) == 1
    assert hd(persisted).id == payload["data"]["id"]
  end

  test "authenticated owner create_category persists a DB row", %{conn: conn, server: server} do
    payload = rpc(conn, "create_category", %{"serverId" => server.id, "name" => "Ops"})

    assert payload["success"] == true

    persisted =
      Servers.Category
      |> Ash.Query.filter(server_id == ^server.id and name == "Ops")
      |> Ash.read!(authorize?: false)

    assert length(persisted) == 1
    assert hd(persisted).id == payload["data"]["id"]
  end

  test "authenticated owner create_channel inside a created category persists with the FK",
       %{conn: conn, server: server} do
    cat_payload = rpc(conn, "create_category", %{"serverId" => server.id, "name" => "Group"})
    category_id = cat_payload["data"]["id"]

    chan_payload =
      rpc(conn, "create_channel", %{
        "serverId" => server.id,
        "name" => "nested",
        "type" => "text",
        "categoryId" => category_id
      })

    assert chan_payload["success"] == true

    {:ok, channel} = Ash.get(Servers.Channel, chan_payload["data"]["id"], authorize?: false)
    assert channel.category_id == category_id
    assert channel.server_id == server.id
  end
end
