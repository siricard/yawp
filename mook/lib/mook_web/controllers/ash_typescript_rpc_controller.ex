defmodule MookWeb.AshTypescriptRpcController do
  use MookWeb, :controller

  def run(conn, params) do
    result = AshTypescript.Rpc.run_action(:mook, conn, params)
    json(conn, result)
  end

  def validate(conn, params) do
    result = AshTypescript.Rpc.validate_action(:mook, conn, params)
    json(conn, result)
  end
end
