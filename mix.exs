defmodule Yawp.Umbrella.MixProject do
  use Mix.Project

  def project do
    [
      apps_path: "apps",
      version: "0.1.0",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases(),
      releases: releases(),
                                    listeners: [Phoenix.CodeReloader]
    ]
  end

        defp deps do
    []
  end

  def cli do
    [
      preferred_envs: [precommit: :test]
    ]
  end

  defp aliases do
    [
            setup: ["cmd mix setup"],
                  precommit: ["compile --warnings-as-errors", "deps.unlock --unused", "format", "test"]
    ]
  end

          defp releases do
    [
      yawp: [
        include_executables_for: [:unix],
        applications: [
          yawp: :permanent,
          yawp_premium: :permanent
        ]
      ]
    ]
  end
end
