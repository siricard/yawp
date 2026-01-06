import Config

if System.get_env("PHX_SERVER") do
  config :mook, MookWeb.Endpoint, server: true
end

config :mook, MookWeb.Endpoint, http: [port: String.to_integer(System.get_env("PORT", "4000"))]

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  maybe_ipv6 = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []

  config :mook, Mook.Repo,
        url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
            socket_options: maybe_ipv6

            secret_key_base =
    System.get_env("SECRET_KEY_BASE") ||
      raise """
      environment variable SECRET_KEY_BASE is missing.
      You can generate one by calling: mix phx.gen.secret
      """

  host = System.get_env("PHX_HOST") || "example.com"

  config :mook, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")

  config :mook, MookWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [
                              ip: {0, 0, 0, 0, 0, 0, 0, 0}
    ],
    secret_key_base: secret_key_base

  config :mook,
    token_signing_secret:
      System.get_env("TOKEN_SIGNING_SECRET") ||
        raise("Missing environment variable `TOKEN_SIGNING_SECRET`!")

                                                              
                                  end
