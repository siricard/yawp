
import Config

config :cinder, default_theme: "daisy_ui"

config :ash_typescript,
  output_file: "assets/app/ash_generated.ts",
  run_endpoint: "/rpc/run",
  validate_endpoint: "/rpc/validate",
  input_field_formatter: :camel_case,
  output_field_formatter: :camel_case,
  require_tenant_parameters: false,
  generate_zod_schemas: false,
  generate_phx_channel_rpc_actions: false,
  generate_validation_functions: true,
  zod_import_path: "zod",
  zod_schema_suffix: "ZodSchema",
  phoenix_import_path: "phoenix"

config :ash_oban, pro?: false

config :mook, Oban,
  engine: Oban.Engines.Basic,
  notifier: Oban.Notifiers.Postgres,
  queues: [default: 10],
  repo: Mook.Repo,
  plugins: [{Oban.Plugins.Cron, []}]

config :ash,
  allow_forbidden_field_for_relationships_by_default?: true,
  include_embedded_source_by_default?: false,
  show_keysets_for_all_actions?: false,
  default_page_type: :keyset,
  policies: [no_filter_static_forbidden_reads?: false],
  keep_read_action_loads_when_loading?: false,
  default_actions_require_atomic?: true,
  read_action_after_action_hooks_in_order?: true,
  bulk_actions_default_to_errors?: true,
  transaction_rollback_on_error?: true,
  redact_sensitive_values_in_errors?: true,
  known_types: [AshPostgres.Timestamptz, AshPostgres.TimestamptzUsec]

config :spark,
  formatter: [
    remove_parens?: true,
    "Ash.Resource": [
      section_order: [
        :admin,
        :authentication,
        :token,
        :user_identity,
        :postgres,
        :resource,
        :code_interface,
        :actions,
        :policies,
        :pub_sub,
        :preparations,
        :changes,
        :validations,
        :multitenancy,
        :attributes,
        :relationships,
        :calculations,
        :aggregates,
        :identities
      ]
    ],
    "Ash.Domain": [
      section_order: [:admin, :resources, :policies, :authorization, :domain, :execution]
    ]
  ]

config :mook,
  ecto_repos: [Mook.Repo],
  generators: [timestamp_type: :utc_datetime],
  ash_domains: [Mook.Accounts, Mook.Chat]

config :mook, MookWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [html: MookWeb.ErrorHTML, json: MookWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Mook.PubSub,
  live_view: [signing_salt: "LGagITuW"]

config :mook, Mook.Mailer, adapter: Swoosh.Adapters.Local

config :esbuild,
  version: "0.25.4",
  mook: [
    args:
      ~w(js/index.tsx js/app.js --bundle --target=es2022 --outdir=../priv/static/assets --external:/fonts/* --external:/images/* --alias:@=. --alias:react-native=react-native-web --alias:react-native-keychain=./js/stubs/keychain.js --alias:react-native-get-random-values=./js/stubs/empty.js --resolve-extensions=.web.tsx,.web.ts,.web.js,.tsx,.ts,.jsx,.js --jsx=automatic --jsx-import-source=nativewind --loader:.js=jsx --splitting --format=esm),
    cd: Path.expand("../assets", __DIR__),
    env: %{
      "NODE_PATH" =>
        Enum.join(
          [
            Path.expand("../deps", __DIR__),
            Path.expand(Mix.Project.build_path()),
            Path.expand("../_build/dev", __DIR__)
          ],
          ":"
        )
    }
  ]

config :tailwind,
  version: "4.1.12",
  mook: [
    args: ~w(
      --input=assets/css/app.css
      --output=priv/static/assets/css/app.css
    ),
    cd: Path.expand("..", __DIR__)
  ]

config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

import_config "#{config_env()}.exs"
