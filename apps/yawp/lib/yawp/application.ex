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
      Yawp.Auth.NonceStore,
      Yawp.Call.SessionSupervisor,
                        YawpWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :yawp]}
    ]

            opts = [strategy: :one_for_one, name: Yawp.Supervisor]
    Supervisor.start_link(children, opts)
  end

      @impl true
  def config_change(changed, _new, removed) do
    YawpWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
