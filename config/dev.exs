import Config
config :ash, policies: [show_policy_breakdowns?: true]

config :yawp, Yawp.Repo,
  username: "postgres",
  password: "postgres",
  hostname: "localhost",
  database: "yawp_dev",
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

config :yawp, YawpWeb.Endpoint,
      http: [ip: {127, 0, 0, 1}],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base: "hpqf7zWrfnzoqUOuxxhij7/1WGDakcC31WvD06M+5YBF4uD4RQBCxXkOswfe32dV",
  watchers: [
    esbuild: {Esbuild, :install_and_run, [:yawp, ~w(--sourcemap=inline --watch)]},
    tailwind: {Tailwind, :install_and_run, [:yawp, ~w(--watch)]}
  ]

config :yawp, YawpWeb.Endpoint,
  live_reload: [
    web_console_logger: true,
    patterns: [
            ~r"priv/static/(?!uploads/).*\.(js|css|png|jpeg|jpg|gif|svg)$",
            ~r"priv/gettext/.*\.po$",
            ~r"(apps/yawp/)?lib/yawp_web/router\.ex$",
      ~r"(apps/yawp/)?lib/yawp_web/(controllers|live|components)/.*\.(ex|heex)$",
            ~r"(apps/yawp/)?assets/app/.*\.(ts|tsx|js|jsx|json)$"
    ]
  ]

config :yawp, dev_routes: true, token_signing_secret: "E+o+Ldp6XJ9VsEqkTk8+UombPEhZoiCJ"

config :logger, :default_formatter, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20

config :phoenix, :plug_init_mode, :runtime

config :phoenix_live_view,
      debug_heex_annotations: true,
  debug_attributes: true,
    enable_expensive_runtime_checks: true

config :swoosh, :api_client, false
