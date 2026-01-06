defmodule Mook.Repo do
  use AshPostgres.Repo,
    otp_app: :mook

  @impl true
  def installed_extensions do
        ["ash-functions", "citext"]
  end

      @impl true
  def prefer_transaction? do
    false
  end

  @impl true
  def min_pg_version do
    %Version{major: 17, minor: 9, patch: 0}
  end
end
