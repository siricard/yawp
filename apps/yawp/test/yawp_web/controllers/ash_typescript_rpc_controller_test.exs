defmodule YawpWeb.AshTypescriptRpcControllerTest do
  @moduledoc """
  assert the `/rpc/run` and `/rpc/validate`
  endpoints live under the dedicated `:rpc` pipeline:

  - JSON-only (`:accepts`).
  - No CSRF protection — bearer-token + Ed25519 sender_signature
    are the integrity gates; CSRF defends a different threat model
    (cross-origin cookie-credentialed requests).
  - No cookie session — the response MUST NOT set a session cookie.
  - Wrong content-type → 415 (rejected by `:accepts`).
  - Wrong method → 405 (no GET binding for these routes).
  """
  use YawpWeb.ConnCase, async: false

  describe "POST /rpc/run pipeline" do
    test "accepts JSON without an x-csrf-token header", %{conn: conn} do
      body = %{
        "action" => "claim_chat_owner",
        "fields" => [],
        "input" => %{}
      }

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/rpc/run", body)

      assert conn.status == 200
      payload = json_response(conn, 200)
      assert payload["success"] == false
      assert is_list(payload["errors"]) and payload["errors"] != []
    end

    test "does not set a session cookie on the response", %{conn: conn} do
      body = %{"action" => "claim_chat_owner", "fields" => [], "input" => %{}}

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/rpc/run", body)

      set_cookies = Plug.Conn.get_resp_header(conn, "set-cookie")

      assert set_cookies == [],
             "expected no Set-Cookie on /rpc/run response, got: #{inspect(set_cookies)}"
    end

    test "rejects non-JSON content-type via :accepts (raises NotAcceptableError)", %{conn: conn} do
      assert_raise Phoenix.NotAcceptableError, fn ->
        conn
        |> put_req_header("accept", "text/html")
        |> put_req_header("content-type", "text/html")
        |> post(~p"/rpc/run", "<html/>")
      end
    end

    test "GET /rpc/run is not routed", %{conn: conn} do
      conn = get(conn, "/rpc/run")
      assert conn.status == 404
    end

    test "allows browser cross-origin bind-device calls", %{conn: conn} do
      body = %{
        "action" => "bind_device",
        "identity" => %{"did" => "did:yawp:missing"},
        "fields" => ["id"],
        "input" => %{}
      }

      conn =
        conn
        |> put_req_header("origin", "http://localhost:4100")
        |> put_req_header("content-type", "application/json")
        |> post(~p"/rpc/run", body)

      assert conn.status == 200
      assert ["*"] = get_resp_header(conn, "access-control-allow-origin")
    end

    test "answers browser preflight for bind-device calls", %{conn: conn} do
      conn =
        conn
        |> put_req_header("origin", "http://localhost:4100")
        |> put_req_header("access-control-request-method", "POST")
        |> put_req_header("access-control-request-headers", "content-type")
        |> options(~p"/rpc/run")

      assert conn.status == 204
      assert ["*"] = get_resp_header(conn, "access-control-allow-origin")
      assert ["GET, POST, OPTIONS"] = get_resp_header(conn, "access-control-allow-methods")

      assert ["authorization, content-type, x-requested-with"] =
               get_resp_header(conn, "access-control-allow-headers")
    end
  end

  describe "POST /rpc/validate pipeline" do
    test "accepts JSON without an x-csrf-token header", %{conn: conn} do
      body = %{
        "action" => "claim_chat_owner",
        "fields" => [],
        "input" => %{}
      }

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post(~p"/rpc/validate", body)

      assert conn.status == 200
    end
  end
end
