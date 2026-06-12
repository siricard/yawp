defmodule YawpWeb.HealthControllerTest do
  use YawpWeb.ConnCase, async: false

  defmodule FailingCheck do
    def check, do: :error
  end

  setup do
    previous = Application.get_env(:yawp, :health_check)

    on_exit(fn ->
      if previous do
        Application.put_env(:yawp, :health_check, previous)
      else
        Application.delete_env(:yawp, :health_check)
      end
    end)

    :ok
  end

  test "GET /health returns ok when the endpoint and database are healthy", %{conn: conn} do
    conn = get(conn, ~p"/health")

    assert json_response(conn, 200) == %{"status" => "ok", "db" => "ok"}
  end

  test "GET /health returns unavailable when the database check fails", %{conn: conn} do
    Application.put_env(:yawp, :health_check, FailingCheck)

    conn = get(conn, ~p"/health")

    assert json_response(conn, 503) == %{"status" => "ok", "db" => "error"}
  end
end
