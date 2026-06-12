defmodule YawpWeb.HealthController do
  use YawpWeb, :controller

  def show(conn, _params) do
    case health_check().check() do
      :ok ->
        json(conn, %{status: "ok", db: "ok"})

      :error ->
        conn
        |> put_status(:service_unavailable)
        |> json(%{status: "ok", db: "error"})
    end
  end

  defp health_check do
    Application.get_env(:yawp, :health_check, Yawp.HealthCheck)
  end
end
