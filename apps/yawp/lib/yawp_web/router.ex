defmodule YawpWeb.Router do
  use YawpWeb, :router

  import Oban.Web.Router
  use AshAuthentication.Phoenix.Router

  import AshAuthentication.Plug.Helpers

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {YawpWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :load_from_session
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :load_from_bearer
    plug :set_actor, :user
  end

  pipeline :rpc do
    plug :accepts, ["json"]
    plug :put_secure_browser_headers
  end

  scope "/", YawpWeb do
    pipe_through :rpc

    post "/rpc/run", AshTypescriptRpcController, :run
    post "/rpc/validate", AshTypescriptRpcController, :validate
  end

  scope "/", YawpWeb do
    pipe_through :browser

    ash_authentication_live_session :admin_authenticated do
      live "/admin", AdminDashboardLive, :index
    end

    get "/ash-typescript", PageController, :index
  end

  scope "/", YawpWeb do
    pipe_through :api

    get "/version", VersionController, :show
  end

  pipeline :well_known do
    plug :accepts, ["json"]
  end

  scope "/.well-known/yawp", YawpWeb do
    pipe_through :well_known

    get "/server-key.json", ServerKeyController, :show
  end

  scope "/", YawpWeb do
    pipe_through :browser

    get "/", PageController, :home

    auth_routes AuthController, Yawp.Admin.Account, path: "/auth"

    get "/admin/logout", AuthController, :logout
    delete "/admin/logout", AuthController, :logout

    get "/admin/setup", AdminSetupController, :new
    post "/admin/setup", AdminSetupController, :create

    sign_in_route path: "/admin/login",
                  auth_routes_prefix: "/auth",
                  on_mount: [{YawpWeb.LiveUserAuth, :live_no_user}],
                  overrides: [
                    YawpWeb.AuthOverrides,
                    Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
                  ]
  end

  if Application.compile_env(:yawp, :dev_routes) do
    import Phoenix.LiveDashboard.Router

    scope "/dev" do
      pipe_through :browser

      live_dashboard "/dashboard", metrics: YawpWeb.Telemetry
      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end

    scope "/" do
      pipe_through :browser

      oban_dashboard("/oban")
    end
  end

  if Application.compile_env(:yawp, :dev_routes) do
    import AshAdmin.Router

    scope "/dev" do
      pipe_through :browser

      ash_admin "/ash-admin"
    end
  end
end
