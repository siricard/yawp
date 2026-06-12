defmodule Yawp.HealthCheck do
  @query_timeout 1_000

  def check do
    case Ecto.Adapters.SQL.query(Yawp.Repo, "SELECT 1", [], timeout: @query_timeout) do
      {:ok, _result} -> :ok
      {:error, _reason} -> :error
    end
  rescue
    _ -> :error
  catch
    :exit, _ -> :error
  end
end
