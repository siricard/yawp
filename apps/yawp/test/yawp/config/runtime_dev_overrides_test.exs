defmodule Yawp.Config.RuntimeDevOverridesTest do
  use ExUnit.Case, async: false

  @runtime_exs Path.expand("../../../../../config/runtime.exs", __DIR__)

  setup do
    prev = %{
      "DATABASE" => System.get_env("DATABASE"),
      "DATABASE_URL" => System.get_env("DATABASE_URL"),
      "POSTGRES_USER" => System.get_env("POSTGRES_USER"),
      "POSTGRES_PASSWORD" => System.get_env("POSTGRES_PASSWORD"),
      "POSTGRES_DB" => System.get_env("POSTGRES_DB"),
      "POSTGRES_HOST" => System.get_env("POSTGRES_HOST"),
      "POSTGRES_PORT" => System.get_env("POSTGRES_PORT"),
      "PORT" => System.get_env("PORT"),
      "SECRET_KEY_BASE" => System.get_env("SECRET_KEY_BASE"),
      "TOKEN_SIGNING_SECRET" => System.get_env("TOKEN_SIGNING_SECRET"),
      "ATTACHMENT_SIGNING_SECRET" => System.get_env("ATTACHMENT_SIGNING_SECRET"),
      "UPLOADS_DIR" => System.get_env("UPLOADS_DIR")
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

  test "prod: required attachment signing secret is fail closed" do
    put_prod_env(%{"ATTACHMENT_SIGNING_SECRET" => nil})

    assert_raise RuntimeError, ~r/ATTACHMENT_SIGNING_SECRET/, fn ->
      read_runtime(:prod)
    end
  end

  test "prod: required uploads dir is fail closed" do
    put_prod_env(%{"UPLOADS_DIR" => nil})

    assert_raise RuntimeError, ~r/UPLOADS_DIR/, fn ->
      read_runtime(:prod)
    end
  end

  test "prod: attachment config reads dedicated secret and uploads dir" do
    put_prod_env(%{
      "ATTACHMENT_SIGNING_SECRET" => "prod-attachment-secret",
      "UPLOADS_DIR" => "/var/lib/yawp/uploads"
    })

    cfg = read_runtime(:prod)

    assert cfg[:yawp][:attachments][:download_secret] == "prod-attachment-secret"
    assert cfg[:yawp][:attachments][:storage_path] == "/var/lib/yawp/uploads"
  end

  test "prod: derives URL-encoded repo URL from Postgres components" do
    put_prod_env(%{
      "DATABASE_URL" => nil,
      "POSTGRES_USER" => "yawp user",
      "POSTGRES_PASSWORD" => "pa:ss@word/with?symbols",
      "POSTGRES_DB" => "yawp/prod",
      "POSTGRES_HOST" => "db.internal",
      "POSTGRES_PORT" => "6543"
    })

    cfg = read_runtime(:prod)

    assert cfg[:yawp][Yawp.Repo][:url] ==
             "ecto://" <>
               "yawp+user:pa%3Ass%40word%2Fwith%3Fsymbols@db.internal:6543/yawp%2Fprod"
  end

  test "prod: explicit DATABASE_URL takes precedence over Postgres components" do
    url = "ecto://" <> "managed:secret" <> "@managed.example/yawp"

    put_prod_env(%{
      "DATABASE_URL" => url,
      "POSTGRES_USER" => "ignored",
      "POSTGRES_PASSWORD" => "ignored",
      "POSTGRES_DB" => "ignored",
      "POSTGRES_HOST" => "ignored",
      "POSTGRES_PORT" => "1111"
    })

    cfg = read_runtime(:prod)

    assert cfg[:yawp][Yawp.Repo][:url] == url
  end

  defp put_prod_env(overrides) do
    base = %{
      "DATABASE_URL" => "ecto://" <> "user:pass" <> "@localhost/yawp_prod",
      "POSTGRES_USER" => "yawp",
      "POSTGRES_PASSWORD" => "postgres-secret",
      "POSTGRES_DB" => "yawp_prod",
      "SECRET_KEY_BASE" => String.duplicate("a", 64),
      "TOKEN_SIGNING_SECRET" => String.duplicate("b", 64),
      "ATTACHMENT_SIGNING_SECRET" => String.duplicate("c", 64),
      "UPLOADS_DIR" => "/tmp/yawp-prod-uploads"
    }

    base
    |> Map.merge(overrides)
    |> Enum.each(fn
      {key, nil} -> System.delete_env(key)
      {key, value} -> System.put_env(key, value)
    end)
  end
end
