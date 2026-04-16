defmodule YawpWeb.AshTypescriptRpcController do
  use YawpWeb, :controller

            plug Yawp.Plug.ChatSession

  def run(conn, params) do
    result = AshTypescript.Rpc.run_action(:yawp, conn, params)
    json(conn, result)
  end

  def validate(conn, params) do
    result = AshTypescript.Rpc.validate_action(:yawp, conn, params)
    json(conn, result)
  end
end
