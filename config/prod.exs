import Config

insecure_peer_hosts =
  "YAWP_FEDERATION_INSECURE_PEER_HOSTS"
  |> System.get_env("")
  |> String.split(",", trim: true)
  |> Enum.map(&String.trim/1)
  |> Enum.reject(&(&1 == ""))
  |> Enum.map(fn peer_host ->
    case URI.parse("//#{peer_host}") do
      %URI{host: parsed} when is_binary(parsed) -> parsed
      _ -> peer_host
    end
  end)

config :yawp, YawpWeb.Endpoint, cache_static_manifest: "priv/static/cache_manifest.json"

config :yawp, YawpWeb.Endpoint,
  force_ssl: [
    rewrite_on: [:x_forwarded_proto],
    exclude: [
      hosts: Enum.uniq(["localhost", "127.0.0.1"] ++ insecure_peer_hosts)
    ]
  ]

config :swoosh, api_client: Swoosh.ApiClient.Req

config :swoosh, local: false

config :logger, level: :info
