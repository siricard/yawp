defmodule Yawp.Config.RuntimeDevOverridesTest do
  use ExUnit.Case, async: false

  @runtime_exs Path.expand("../../../../../config/runtime.exs", __DIR__)

  setup do
    prev = %{
      "DATABASE" => System.get_env("DATABASE"),
      "DATABASE_URL" => System.get_env("DATABASE_URL"),
      "PORT" => System.get_env("PORT")
    }

    on_exit(fn ->
      Enum.each(prev, fn
        {k, nil} -> System.delete_env(k)
        {k, v} -> System.put_env(k, v)
      end)
    end)

    Enum.each(Map.keys(prev), &System.delete_env/1)
    :ok
  end

  defp read_runtime(env) do
    Config.Reader.read!(@runtime_exs, env: env)
  end

  test "dev: no env vars → repo config falls back to compile-time defaults" do
    cfg = read_runtime(:dev)
    repo = cfg[:yawp][Yawp.Repo] || []

    refute Keyword.has_key?(repo, :url)
    refute Keyword.has_key?(repo, :database)
  end

  test "dev: DATABASE overrides the database name" do
    System.put_env("DATABASE", "yawp_anchor_b_dev")
    cfg = read_runtime(:dev)
    assert cfg[:yawp][Yawp.Repo][:database] == "yawp_anchor_b_dev"
    refute Keyword.has_key?(cfg[:yawp][Yawp.Repo], :url)
  end

  test "dev: DATABASE_URL overrides the full connection URL and takes precedence over DATABASE" do
    url = "ecto://" <> "u:p" <> "@localhost/yawp_other"
    System.put_env("DATABASE_URL", url)
    System.put_env("DATABASE", "ignored_when_url_set")
    cfg = read_runtime(:dev)
    repo = cfg[:yawp][Yawp.Repo]
    assert repo[:url] == url
    refute Keyword.has_key?(repo, :database)
  end

  test "dev: PORT (already supported) is honored on the endpoint" do
    System.put_env("PORT", "4100")
    cfg = read_runtime(:dev)
    assert cfg[:yawp][YawpWeb.Endpoint][:http][:port] == 4100
  end

  test "test env: DATABASE/DATABASE_URL do NOT bleed into test repo config" do
    System.put_env("DATABASE", "should_be_ignored_in_test")
    System.put_env("DATABASE_URL", "ecto://nope")
    cfg = read_runtime(:test)
    repo = cfg[:yawp][Yawp.Repo] || []
    refute Keyword.has_key?(repo, :url)
    refute Keyword.has_key?(repo, :database)
  end
end
