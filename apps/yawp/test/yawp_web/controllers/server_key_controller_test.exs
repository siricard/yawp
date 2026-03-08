defmodule YawpWeb.ServerKeyControllerTest do
  @moduledoc """
  `GET /.well-known/yawp/server-key.json`. Public, no auth.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Federation.ServerKey

  setup do
    {:ok, key} = ServerKey.generate()
    %{key: key}
  end

  test "returns a JSON document with the active key", %{conn: conn, key: key} do
    conn = get(conn, "/.well-known/yawp/server-key.json")

    assert ["application/json" <> _] = get_resp_header(conn, "content-type")
    body = json_response(conn, 200)

    assert is_list(body["keys"])
    [entry] = body["keys"]

    assert entry["key_id"] == key.key_id
    assert entry["alg"] == "Ed25519"
    assert is_binary(entry["public_key"])
    assert is_binary(entry["not_before"])
    assert is_binary(entry["not_after"])

        assert {:ok, decoded} = Base.url_decode64(entry["public_key"], padding: false)
    assert decoded == key.public_key
  end

  test "omits revoked keys", %{conn: conn, key: key} do
    {:ok, _} = ServerKey.revoke(key)
    {:ok, fresh} = ServerKey.generate()

    body = conn |> get("/.well-known/yawp/server-key.json") |> json_response(200)

    key_ids = Enum.map(body["keys"], & &1["key_id"])
    refute key.key_id in key_ids
    assert fresh.key_id in key_ids
  end
end
