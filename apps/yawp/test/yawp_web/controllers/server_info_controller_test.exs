defmodule YawpWeb.ServerInfoControllerTest do
  @moduledoc """
  `GET /.well-known/yawp/server-info`. Public, no auth.
  """
  use YawpWeb.ConnCase, async: false

  require Ash.Query

  alias Yawp.Identity
  alias Yawp.Servers

  setup do
    :ok = Servers.Seeder.run()
    {:ok, _key} = Yawp.Federation.generate_server_key()
    :ok
  end

  defp claim_server! do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    owner = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

    {:ok, server} = Servers.get_singleton_server()
    {:ok, owner_role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [owner_role.id])
    owner
  end

  test "returns claimed=false before any operator claim", %{conn: conn} do
    body = conn |> get("/.well-known/yawp/server-info") |> json_response(200)

    assert body["claimed"] == false
    assert body["serverName"] == "Yawp"
    assert is_binary(body["fingerprint"])
  end

  test "returns claimed=true once an Owner membership exists", %{conn: conn} do
    _owner = claim_server!()

    body = conn |> get("/.well-known/yawp/server-info") |> json_response(200)

    assert body["claimed"] == true
    assert body["serverName"] == "Yawp"
  end

  test "sets a cache-control header", %{conn: conn} do
    conn = get(conn, "/.well-known/yawp/server-info")

    assert ["public, max-age=30"] = get_resp_header(conn, "cache-control")
    assert ["application/json" <> _] = get_resp_header(conn, "content-type")
  end
end
