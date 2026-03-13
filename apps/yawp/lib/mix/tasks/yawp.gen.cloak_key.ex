defmodule Mix.Tasks.Yawp.Gen.CloakKey do
  @moduledoc "Generates a CLOAK_KEY value (base64-encoded 32-byte random key) and prints it."
  @shortdoc "Generates a CLOAK_KEY value"
  use Mix.Task

  @impl Mix.Task
  def run(_) do
    key = 32 |> :crypto.strong_rand_bytes() |> Base.encode64()
    IO.puts(key)
  end
end
