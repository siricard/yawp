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
                        YawpWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :yawp]}
    ]

            opts = [strategy: :one_for_one, name: Yawp.Supervisor]

    case Supervisor.start_link(children, opts) do
      {:ok, _pid} = ok ->
        ensure_active_server_key()
        ok

      other ->
        other
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

      @impl true
  def config_change(changed, _new, removed) do
    YawpWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
