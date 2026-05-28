defmodule Yawp.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      YawpWeb.Telemetry,
      Yawp.Repo,
      {DNSCluster, query: Application.get_env(:yawp, :dns_cluster_query) || :ignore},
      {Oban,
       AshOban.config(
         Application.fetch_env!(:yawp, :ash_domains),
         Application.fetch_env!(:yawp, Oban)
       )},
      {Phoenix.PubSub, name: Yawp.PubSub},
      Yawp.Vault,
      Yawp.Admin.SetupToken,
      YawpWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :yawp]}
    ]

    opts = [strategy: :one_for_one, name: Yawp.Supervisor]

    case Supervisor.start_link(children, opts) do
      {:ok, _pid} = ok ->
        ensure_active_server_key()
        maybe_run_servers_seeder()
        maybe_announce_setup_token()
        ok

      other ->
        other
    end
  end

  defp maybe_announce_setup_token do
    if Application.get_env(:yawp, :announce_setup_token_on_boot, true) do
      try do
        if account_count() == 0 do
          {:ok, token} = Yawp.Admin.SetupToken.generate()
          url = setup_url(token)

          banner =
            "=== Yawp setup: visit #{url} to create the first operator ==="

          IO.puts(banner)
        end
      rescue
        error ->
          require Logger
          Logger.warning("Failed to announce admin setup token: #{inspect(error)}")
      end
    end
  end

  defp account_count do
    Yawp.Admin.Account
    |> Ash.Query.for_read(:read)
    |> Ash.count!(authorize?: false)
  end

  defp setup_url(token) do
    url_config = Application.get_env(:yawp, YawpWeb.Endpoint, [])[:url] || []
    host = Keyword.get(url_config, :host, "localhost")
    scheme = Keyword.get(url_config, :scheme, "http")
    port = Keyword.get(url_config, :port) || endpoint_http_port()

    "#{scheme}://#{host}:#{port}/admin/setup?token=#{token}"
  end

  defp endpoint_http_port do
    case Application.get_env(:yawp, YawpWeb.Endpoint, [])[:http] do
      nil -> 4000
      http -> Keyword.get(http, :port, 4000)
    end
  end

  defp ensure_active_server_key do
    if Application.get_env(:yawp, :ensure_server_key_on_boot, true) do
      try do
        Yawp.Federation.ensure_active_server_key!()
      rescue
        error ->
          require Logger
          Logger.warning("Failed to ensure active federation server key: #{inspect(error)}")
      end
    end
  end

  defp maybe_run_servers_seeder do
    if Application.get_env(:yawp, :run_servers_seeder_on_boot, true) do
      try do
        Yawp.Servers.Seeder.run()
      rescue
        error ->
          require Logger
          Logger.warning("Yawp.Servers.Seeder: skipping seed due to error: #{inspect(error)}")
      end
    end
  end

  @impl true
  def config_change(changed, _new, removed) do
    YawpWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
