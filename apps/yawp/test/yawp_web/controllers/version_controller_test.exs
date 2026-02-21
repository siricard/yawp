defmodule YawpWeb.VersionControllerTest do
  use YawpWeb.ConnCase, async: false

  setup do
    previous = Application.get_env(:yawp, :build_info)

    Application.put_env(:yawp, :build_info,
      version: "1.2.3",
      commit: "abcdef0",
      built_at: "2025-05-18T00:00:00Z"
    )

    on_exit(fn ->
      if previous do
        Application.put_env(:yawp, :build_info, previous)
      else
        Application.delete_env(:yawp, :build_info)
      end
    end)

    :ok
  end

  test "GET /version returns the configured build info as JSON", %{conn: conn} do
    conn = get(conn, ~p"/version")

    assert %{
             "version" => "1.2.3",
             "commit" => "abcdef0",
             "built_at" => "2025-05-18T00:00:00Z"
           } = json_response(conn, 200)
  end

  test "GET /version response keys are the documented three fields", %{conn: conn} do
    body = conn |> get(~p"/version") |> json_response(200)

    assert Map.keys(body) |> Enum.sort() == ["built_at", "commit", "version"]
  end
end
