defmodule Mook.Application do
      @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      MookWeb.Telemetry,
      Mook.Repo,
      {DNSCluster, query: Application.get_env(:mook, :dns_cluster_query) || :ignore},
      {Oban,
       AshOban.config(
         Application.fetch_env!(:mook, :ash_domains),
         Application.fetch_env!(:mook, Oban)
       )},
      {Phoenix.PubSub, name: Mook.PubSub},
                        MookWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :mook]}
    ]

            opts = [strategy: :one_for_one, name: Mook.Supervisor]
    Supervisor.start_link(children, opts)
  end

      @impl true
  def config_change(changed, _new, removed) do
    MookWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
