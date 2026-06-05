defmodule YawpWeb.PublicCors do
  @moduledoc false

  import Plug.Conn

  @allowed_methods "GET, POST, OPTIONS"
  @allowed_headers "authorization, content-type, x-requested-with"
  @max_age "86400"

  def init(opts), do: opts

  def call(conn, _opts) do
    if cors_path?(conn.request_path) do
      conn
      |> put_cors_headers()
      |> maybe_send_preflight()
    else
      conn
    end
  end

  defp maybe_send_preflight(%{method: "OPTIONS"} = conn) do
    conn
    |> send_resp(:no_content, "")
    |> halt()
  end

  defp maybe_send_preflight(conn) do
    register_before_send(conn, &put_cors_headers/1)
  end

  defp put_cors_headers(conn) do
    conn
    |> put_resp_header("access-control-allow-origin", "*")
    |> put_resp_header("access-control-allow-methods", @allowed_methods)
    |> put_resp_header("access-control-allow-headers", @allowed_headers)
    |> put_resp_header("access-control-max-age", @max_age)
  end

  defp cors_path?("/.well-known/yawp/" <> _), do: true
  defp cors_path?("/federation/" <> _), do: true
  defp cors_path?("/rpc/run"), do: true
  defp cors_path?("/rpc/validate"), do: true
  defp cors_path?(_path), do: false
end
