import Config
config :yawp, Oban, testing: :manual
config :yawp, token_signing_secret: "********************************"
config :yawp, dev_routes: true
config :yawp, ensure_server_key_on_boot: false
config :yawp, announce_setup_token_on_boot: false
config :bcrypt_elixir, log_rounds: 1
config :argon2_elixir, t_cost: 1, m_cost: 8
config :ash, policies: [show_policy_breakdowns?: true], disable_async?: true

config :yawp, Yawp.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "yawp_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :yawp, YawpWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "mF2gf+Lrs3Bwiq3Y+uvZp/W9jlaPu5WwXmrdkRVV2qbapTTBndbbS6gvYEKkzBTF",
  server: false

config :yawp, Yawp.Mailer, adapter: Swoosh.Adapters.Test

config :swoosh, :api_client, false

config :logger, level: :warning

config :phoenix, :plug_init_mode, :runtime

config :phoenix_live_view,
  enable_expensive_runtime_checks: true

config :phoenix,
  sort_verified_routes_query_params: true
