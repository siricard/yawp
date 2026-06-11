defmodule YawpWeb.ServerInfoController do
  @moduledoc """
  Publishes this anchor's public setup state at
  `GET /.well-known/yawp/server-info`. Public, no auth, cacheable.

  Clients probe this before binding to decide whether the only valid
  token is the operator claim token (unclaimed) or a chat invite
  (claimed).
  """

  use YawpWeb, :controller

  def show(conn, _params) do
    info = Yawp.Servers.SetupState.info()

    conn
    |> put_resp_header("cache-control", "public, max-age=30")
    |> json(%{
      "claimed" => info.claimed,
      "serverId" => info.server_id,
      "serverName" => info.server_name,
      "fingerprint" => info.fingerprint
    })
  end
end
