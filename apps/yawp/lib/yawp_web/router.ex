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

  scope "/", YawpWeb do
    pipe_through :browser

    ash_authentication_live_session :authenticated_routes do
                                                                end

    post "/rpc/run", AshTypescriptRpcController, :run
    post "/rpc/validate", AshTypescriptRpcController, :validate
    get "/ash-typescript", PageController, :index
  end

  scope "/", YawpWeb do
    pipe_through :api

    get "/version", VersionController, :show
  end

  scope "/", YawpWeb do
    pipe_through :browser

    get "/", PageController, :home
    auth_routes AuthController, Yawp.Accounts.User, path: "/auth"
    sign_out_route AuthController

        sign_in_route register_path: "/register",
                  reset_path: "/reset",
                  auth_routes_prefix: "/auth",
                  on_mount: [{YawpWeb.LiveUserAuth, :live_no_user}],
                  overrides: [
                    YawpWeb.AuthOverrides,
                    Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
                  ]

        reset_route auth_routes_prefix: "/auth",
                overrides: [
                  YawpWeb.AuthOverrides,
                  Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI
                ]

        confirm_route Yawp.Accounts.User, :confirm_new_user,
      auth_routes_prefix: "/auth",
      overrides: [YawpWeb.AuthOverrides, Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI]

        magic_sign_in_route(Yawp.Accounts.User, :magic_link,
      auth_routes_prefix: "/auth",
      overrides: [YawpWeb.AuthOverrides, Elixir.AshAuthentication.Phoenix.Overrides.DaisyUI]
    )
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
