defmodule YawpWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :yawp

        @session_options [
    store: :cookie,
    key: "_yawp_key",
    signing_salt: "A86h2uWA",
    same_site: "Lax"
  ]

  socket "/live", Phoenix.LiveView.Socket,
    websocket: [connect_info: [session: @session_options]],
    longpoll: [connect_info: [session: @session_options]]

    socket "/socket", YawpWeb.UserSocket, websocket: true

            plug Plug.Static,
    at: "/",
    from: :yawp,
    gzip: not code_reloading?,
    only: YawpWeb.static_paths(),
    raise_on_missing_only: code_reloading?

  if Mix.env() == :dev do
    plug Tidewave
  end

      if code_reloading? do
    plug AshAi.Mcp.Dev,
            protocol_version_statement: "2024-11-05",
      otp_app: :yawp,
      path: "/ash_ai/mcp"

    socket "/phoenix/live_reload/socket", Phoenix.LiveReloader.Socket
    plug Phoenix.LiveReloader
    plug Phoenix.CodeReloader
    plug AshPhoenix.Plug.CheckCodegenStatus
    plug Phoenix.Ecto.CheckRepoStatus, otp_app: :yawp
  end

  plug Phoenix.LiveDashboard.RequestLogger,
    param_key: "request_logger",
    cookie_key: "request_logger"

  plug Plug.RequestId
  plug Plug.Telemetry, event_prefix: [:phoenix, :endpoint]

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head
  plug Plug.Session, @session_options
  plug YawpWeb.Router
end
