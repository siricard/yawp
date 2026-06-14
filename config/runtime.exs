import Config

if System.get_env("PHX_SERVER") do
  config :yawp, YawpWeb.Endpoint, server: true
end

config :yawp, YawpWeb.Endpoint, http: [port: String.to_integer(System.get_env("PORT", "4000"))]

if config_env() == :dev do
  cond do
    url = System.get_env("DATABASE_URL") ->
      config :yawp, Yawp.Repo, url: url

    db = System.get_env("DATABASE") ->
      config :yawp, Yawp.Repo, database: db

    true ->
      :ok
  end
end

config :yawp, :build_info,
  version: System.get_env("YAWP_VERSION", "unknown"),
  commit: System.get_env("YAWP_COMMIT", "unknown"),
  built_at: System.get_env("YAWP_BUILT_AT", "unknown")

if config_env() == :prod do
  database_url =
    case System.get_env("DATABASE_URL") do
      url when is_binary(url) and url != "" ->
        url

      _ ->
        postgres_components = %{
          "POSTGRES_USER" => System.get_env("POSTGRES_USER"),
          "POSTGRES_PASSWORD" => System.get_env("POSTGRES_PASSWORD"),
          "POSTGRES_DB" => System.get_env("POSTGRES_DB")
        }

        missing_components =
          postgres_components
          |> Enum.filter(fn {_key, value} -> value in [nil, ""] end)
          |> Enum.map_join(", ", fn {key, _value} -> key end)

        if missing_components != "" do
          raise """
          environment variable DATABASE_URL is missing, and the Postgres component set is incomplete.
          Missing required variable(s): #{missing_components}.
          Set DATABASE_URL for an external database, or set POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB for the bundled Postgres service.
          """
        end

        postgres_host = System.get_env("POSTGRES_HOST", "postgres")
        postgres_port = System.get_env("POSTGRES_PORT", "5432")

        userinfo =
          URI.encode_www_form(postgres_components["POSTGRES_USER"]) <>
            ":" <> URI.encode_www_form(postgres_components["POSTGRES_PASSWORD"])

        %URI{
          scheme: "ecto",
          userinfo: userinfo,
          host: postgres_host,
          port: String.to_integer(postgres_port),
          path: "/" <> URI.encode_www_form(postgres_components["POSTGRES_DB"])
        }
        |> URI.to_string()
    end

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :yawp, Yawp.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: maybe_ipv6

  secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  attachment_signing_secret =
    System.get_env("ATTACHMENT_SIGNING_SECRET") ||
      raise """
      environment variable ATTACHMENT_SIGNING_SECRET is missing.
      You can generate one by calling: openssl rand -base64 48
      """

  uploads_dir =
    System.get_env("UPLOADS_DIR") ||
      raise """
      environment variable UPLOADS_DIR is missing.
      Set it to an absolute path for local attachment storage.
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :yawp, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :yawp, YawpWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
      ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  config :yawp,
    token_signing_secret:
      System.get_env("TOKEN_SIGNING_SECRET") ||
        raise("Missing environment variable `TOKEN_SIGNING_SECRET`!")

  config :yawp, :attachments,
    backend: :local,
    storage_path: uploads_dir,
    download_secret: attachment_signing_secret
end
