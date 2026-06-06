defmodule Mix.Tasks.Yawp.DmFixtures do
  @moduledoc false

  use Mix.Task

  @impl true
  def run(args) do
    Mix.Task.run("app.start")

    {opts, _rest, _invalid} =
      OptionParser.parse(args,
        strict: [
          anchor: :string,
          anchor_url: :string,
          peer_anchor_url: :string,
          output_dir: :string
        ]
      )

    anchor =
      case Keyword.get(opts, :anchor, "a") do
        "a" -> :a
        "b" -> :b
        other -> Mix.raise("--anchor must be a or b, got #{inspect(other)}")
      end

    fixture_opts = %{
      anchor: anchor,
      anchor_url: Keyword.get(opts, :anchor_url, "http://localhost:4000"),
      peer_anchor_url: Keyword.get(opts, :peer_anchor_url, "http://localhost:4100"),
      output_dir: Keyword.get(opts, :output_dir, Yawp.Dev.DmFixtures.default_output_dir())
    }

    case Yawp.Dev.DmFixtures.provision(fixture_opts) do
      {:ok, artifact} ->
        Mix.shell().info("DM fixture cast written to #{artifact["path"]}")

      {:error, reason} ->
        Mix.raise("could not provision DM fixture cast: #{inspect(reason)}")
    end
  end
end
