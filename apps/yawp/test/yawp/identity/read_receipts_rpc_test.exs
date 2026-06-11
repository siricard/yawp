defmodule Yawp.Identity.ReadReceiptsRpcTest do
  @moduledoc false

  use YawpWeb.ConnCase, async: false

  alias Yawp.Identity

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    identity = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
    %{identity: identity, did: did}
  end

  defp rpc_body(did, enabled) do
    %{
      "action" => "set_read_receipts",
      "identity" => %{"did" => did},
      "fields" => ["did", "readReceiptsEnabled"],
      "input" => %{"readReceiptsEnabled" => enabled}
    }
  end

  defp notification_body(did) do
    %{
      "action" => "upsert_notification_preference",
      "input" => %{
        "identityDid" => did,
        "serverId" => Ecto.UUID.generate(),
        "level" => "muted"
      },
      "fields" => ["id", "level"]
    }
  end

  defp push_token_body(identity_id) do
    %{
      "action" => "upsert_device_push_token",
      "input" => %{
        "identityId" => identity_id,
        "deviceSubkeyId" => Ecto.UUID.generate(),
        "platform" => "apns",
        "token" => "token"
      },
      "fields" => ["id"]
    }
  end

  test "set_read_receipts rejects unauthenticated rpc calls", %{conn: conn} do
    %{did: did} = seed_identity!()

    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/rpc/run", rpc_body(did, false))

    payload = json_response(conn, 200)
    assert payload["success"] == false
    assert [%{"type" => "unauthorized"} | _] = payload["errors"]
  end

  test "set_read_receipts requires the authenticated identity to match", %{conn: conn} do
    %{did: did} = seed_identity!()
    %{identity: other} = seed_identity!()
    {:ok, %{session_token: session}} = Identity.issue_pair(other.id, Ecto.UUID.generate())

    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> put_req_header("authorization", "Bearer #{session.token}")
      |> post(~p"/rpc/run", rpc_body(did, false))

    payload = json_response(conn, 200)
    assert payload["success"] == false
    assert [%{"type" => "unauthorized"} | _] = payload["errors"]
  end

  test "set_read_receipts updates the row and mirrors the private blob", %{conn: conn} do
    %{identity: identity, did: did} = seed_identity!()
    {:ok, %{session_token: session}} = Identity.issue_pair(identity.id, Ecto.UUID.generate())

    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> put_req_header("authorization", "Bearer #{session.token}")
      |> post(~p"/rpc/run", rpc_body(did, false))

    payload = json_response(conn, 200)
    assert payload["success"] == true
    assert payload["data"]["readReceiptsEnabled"] == false

    {:ok, refreshed} = Identity.get_identity_by_did(did)
    assert refreshed.read_receipts_enabled == false

    {:ok, blob} = Identity.get_private_blob_by_did(did)
    assert Jason.decode!(blob.ciphertext)["read_receipts_enabled"] == false
    assert blob.blob_version == 1
  end

  test "notification preference rpc rejects unauthenticated calls", %{conn: conn} do
    %{did: did} = seed_identity!()

    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/rpc/run", notification_body(did))

    payload = json_response(conn, 200)
    assert payload["success"] == false
    assert [%{"type" => "unauthorized"} | _] = payload["errors"]
  end

  test "device push token rpc rejects unauthenticated calls", %{conn: conn} do
    %{identity: identity} = seed_identity!()

    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/rpc/run", push_token_body(identity.id))

    payload = json_response(conn, 200)
    assert payload["success"] == false
    assert [%{"type" => "unauthorized"} | _] = payload["errors"]
  end
end
