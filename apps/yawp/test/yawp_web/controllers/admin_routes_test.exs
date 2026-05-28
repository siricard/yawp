defmodule YawpWeb.AdminRoutesTest do
  use YawpWeb.ConnCase, async: true

  describe "AshAdmin mount location" do
    test "GET /admin no longer hits AshAdmin (redirects to /admin/login or renders dashboard)",
         %{conn: conn} do
      conn = get(conn, "/admin")
      assert conn.status in [200, 302]
      refute conn.resp_body =~ "AshAdmin"

      if conn.status == 302 do
        assert redirected_to(conn) == "/admin/login"
      end
    end

    test "GET /dev/ash-admin hits AshAdmin", %{conn: conn} do
      conn = get(conn, "/dev/ash-admin")
      assert conn.status in [200, 302]
    end

    test "router has AshAdmin route mounted under /dev/ash-admin and not /admin" do
      routes = YawpWeb.Router.__routes__()
      paths = Enum.map(routes, & &1.path)

      allowed = ~w(/admin /admin/login /admin/logout /admin/setup)

      unexpected =
        paths
        |> Enum.filter(&String.starts_with?(&1, "/admin"))
        |> Enum.reject(&(&1 in allowed))

      assert unexpected == [],
             "Unexpected /admin routes (only #{inspect(allowed)} permitted ): #{inspect(unexpected)}"

      refute Enum.any?(routes, fn route ->
               String.starts_with?(route.path, "/admin") and
                 inspect(route.plug) =~ "AshAdmin"
             end),
             "Expected no AshAdmin routes under /admin"

      assert Enum.any?(paths, &String.starts_with?(&1, "/dev/ash-admin")),
             "Expected at least one /dev/ash-admin route; got paths: #{inspect(paths)}"
    end
  end
end
