import Config
config :mook, Oban, testing: :manual
config :mook, token_signing_secret: "4bgPM4LgjgCv2c4r5szVIhdCaG5ArVxi"
config :bcrypt_elixir, log_rounds: 1
config :ash, policies: [show_policy_breakdowns?: true], disable_async?: true

config :mook, Mook.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "mook_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :mook, MookWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "mF2gf+Lrs3Bwiq3Y+uvZp/W9jlaPu5WwXmrdkRVV2qbapTTBndbbS6gvYEKkzBTF",
  server: false

config :mook, Mook.Mailer, adapter: Swoosh.Adapters.Test

config :swoosh, :api_client, false

config :logger, level: :warning

config :phoenix, :plug_init_mode, :runtime

config :phoenix_live_view,
  enable_expensive_runtime_checks: true

config :phoenix,
  sort_verified_routes_query_params: true
