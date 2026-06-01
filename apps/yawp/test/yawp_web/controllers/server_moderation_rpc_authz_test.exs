defmodule YawpWeb.ServerModerationRpcAuthzTest do
  @moduledoc """
  End-to-end authorization over the live `POST /rpc/run` endpoint: a
  low-privilege actor's bearer token is attached and the moderation
  actions (kick / ban / create room invite) are driven through the wire,
  asserting the server refuses with `missing_permission` — the
  RPC-everywhere shape of an HTTP 403 (ADR 028). An owner token over the
  same path succeeds, proving the gate is real rather than a blanket deny.
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

  defp member!(server) do
    member = seed_identity!()
    {:ok, role} = Servers.get_system_role_for_server("Member", server.id)
    {:ok, _} = Servers.assign_role(member.id, server.id, [role.id])
    member
  end

  defp guest!(server) do
    guest = seed_identity!()

    role =
      Ash.Seed.seed!(Yawp.Servers.Role, %{
        server_id: server.id,
        name: "Guest-#{Ecto.UUID.generate()}",
        system: false,
        permission_bits: Yawp.Servers.Permissions.bit(:read_messages),
        position: 0
      })

    {:ok, _} = Servers.assign_role(guest.id, server.id, [role.id])
    guest
  end

  defp bearer(identity) do
    {:ok, %{session_token: session}} = Identity.issue_pair(identity.id, Ecto.UUID.generate())
    session.token
  end

  defp rpc(conn, identity, action, input) do
    conn
    |> put_req_header("content-type", "application/json")
    |> put_req_header("authorization", "Bearer #{bearer(identity)}")
    |> post(~p"/rpc/run", %{"action" => action, "fields" => ["id"], "input" => input})
    |> json_response(200)
  end

  defp error_types(payload) do
    Enum.map(payload["errors"] || [], & &1["type"])
  end

  describe "low-privilege actor over POST /rpc/run is refused (missing_permission)" do
    test "a Member cannot kick another member", %{conn: conn, server: server} do
      _owner = owner!(server)
      member = member!(server)
      victim = member!(server)

      payload =
        rpc(conn, member, "kick_member", %{
          "serverId" => server.id,
          "identityId" => victim.id
        })

      assert payload["success"] == false
      assert "missing_permission" in error_types(payload)

      victim_membership =
        Yawp.Servers.Membership
        |> Ash.Query.filter(identity_id == ^victim.id and server_id == ^server.id)
        |> Ash.read_one!(authorize?: false)

      assert victim_membership.kicked == false
    end

    test "a Member cannot ban another member", %{conn: conn, server: server} do
      _owner = owner!(server)
      member = member!(server)
      victim = member!(server)

      payload =
        rpc(conn, member, "ban_member", %{
          "serverId" => server.id,
          "identityId" => victim.id
        })

      assert payload["success"] == false
      assert "missing_permission" in error_types(payload)

      victim_membership =
        Yawp.Servers.Membership
        |> Ash.Query.filter(identity_id == ^victim.id and server_id == ^server.id)
        |> Ash.read_one!(authorize?: false)

      assert victim_membership.banned == false
    end

    test "a read-only guest cannot create a room invite", %{
      conn: conn,
      server: server,
      channel: channel
    } do
      _owner = owner!(server)
      guest = guest!(server)

      payload =
        rpc(conn, guest, "create_room_invite", %{"channelId" => channel.id})

      assert payload["success"] == false
      assert "missing_permission" in error_types(payload)
    end
  end

  describe "an Owner over the same path succeeds" do
    test "owner kicks a member through POST /rpc/run", %{conn: conn, server: server} do
      owner = owner!(server)
      victim = member!(server)

      payload =
        rpc(conn, owner, "kick_member", %{
          "serverId" => server.id,
          "identityId" => victim.id
        })

      assert payload["success"] == true

      victim_membership =
        Yawp.Servers.Membership
        |> Ash.Query.filter(identity_id == ^victim.id and server_id == ^server.id)
        |> Ash.read_one!(authorize?: false)

      assert victim_membership.kicked == true
    end
  end
end
