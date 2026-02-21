defmodule YawpWeb.VersionController do
  @moduledoc """
  Exposes build provenance for the running release at `GET /version`.

  Values come from `Application.get_env(:yawp, :build_info)`, populated by
  `config/runtime.exs` from the `YAWP_VERSION`, `YAWP_COMMIT`, and
  `YAWP_BUILT_AT` environment variables. The Dockerfile passes these as
  build-time `ARG`s that become container `ENV`s, so a rebuild bumps the
  reported triple.
  """

  use YawpWeb, :controller

  def show(conn, _params) do
    info = Application.get_env(:yawp, :build_info, [])

    body = %{
      version: Keyword.get(info, :version, "unknown"),
      commit: Keyword.get(info, :commit, "unknown"),
      built_at: Keyword.get(info, :built_at, "unknown")
    }

    json(conn, body)
  end
end
