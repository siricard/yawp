defmodule YawpWeb.AdminRoutesTest do
  use YawpWeb.ConnCase, async: true

  describe "AshAdmin mount location" do
    test "GET /admin does not hit AshAdmin (returns 404)", %{conn: conn} do
                  conn = get(conn, "/admin")
      assert conn.status == 404
      refute conn.resp_body =~ "AshAdmin"
    end

    test "GET /admin/ does not hit AshAdmin (returns 404)", %{conn: conn} do
      conn = get(conn, "/admin/")
      assert conn.status == 404
      refute conn.resp_body =~ "AshAdmin"
    end

    test "GET /dev/ash-admin hits AshAdmin", %{conn: conn} do
            conn = get(conn, "/dev/ash-admin")
      assert conn.status in [200, 302]
    end

    test "router has AshAdmin route mounted under /dev/ash-admin and not /admin" do
      paths =
        YawpWeb.Router.__routes__()
        |> Enum.map(& &1.path)

      refute Enum.any?(paths, &String.starts_with?(&1, "/admin")),
             "Expected no /admin routes; got: #{inspect(Enum.filter(paths, &String.starts_with?(&1, "/admin")))}"

      assert Enum.any?(paths, &String.starts_with?(&1, "/dev/ash-admin")),
             "Expected at least one /dev/ash-admin route; got paths: #{inspect(paths)}"
    end
  end
end
