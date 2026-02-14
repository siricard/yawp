defmodule Yawp.Release do
  @moduledoc """
  Tasks invokable from a built `mix release` (no Mix available at runtime).

  Used by the Docker entrypoint to run pending Ecto migrations before the
  Phoenix endpoint boots. Modeled after `mix phx.gen.release`.
  """

  @app :yawp

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()
    {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to: version))
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    Application.load(@app)
  end
end
