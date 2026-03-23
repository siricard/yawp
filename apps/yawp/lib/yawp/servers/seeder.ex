defmodule Yawp.Servers.Seeder do
  @moduledoc """
  Idempotently seeds the singleton `Server` row plus its three system
  roles (`Owner`, `Admin`, `Member`) and the default `#general` text /
  `General` voice channels on application boot.

  Boot path lives in `Yawp.Application.start/2`, after the federation
  server-key bootstrap. Wrapped in `try/rescue` upstream so a transient
  DB error doesn't take down the whole app.
  """

  require Logger

  @system_role_names ["Owner", "Admin", "Member"]
  @default_channels [
    %{name: "general", type: :text},
    %{name: "General", type: :voice}
  ]
  @default_server_name "Yawp"

      @advisory_lock_key 7_160_000_000_000_001

  @doc """
  Idempotent seed entrypoint. Returns `:ok` either way.

  Wraps the seed in a Repo transaction guarded by a Postgres advisory
  lock so concurrent invocations cannot double-seed.
  """
  @spec run() :: :ok
  def run do
    {:ok, result} =
      Yawp.Repo.transaction(fn ->
        Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [@advisory_lock_key])

        case Yawp.Servers.list_servers() do
          {:ok, [_ | _]} ->
            Logger.info("Yawp.Servers.Seeder: seeding skipped (server already exists)")
            :skipped

          {:ok, []} ->
            seed!()
        end
      end)

    case result do
      {:ok, notifications} -> Ash.Notifier.notify(notifications)
      :skipped -> :ok
    end

    :ok
  end

  defp seed! do
    notify_opts = [return_notifications?: true]

    {:ok, server, server_notifications} =
      Yawp.Servers.create_server(@default_server_name, notify_opts)

    Logger.info("Yawp.Servers.Seeder: created server #{server.id}")

    role_notifications =
      for role_name <- @system_role_names do
        {:ok, _role, n} =
          Yawp.Servers.create_role(
            %{
              server_id: server.id,
              name: role_name,
              system: true,
              permissions: %{}
            },
            notify_opts
          )

        Logger.info("Yawp.Servers.Seeder: created system role #{role_name}")
        n
      end

    channel_notifications =
      for %{name: name, type: type} <- @default_channels do
        {:ok, _channel, n} =
          Yawp.Servers.create_channel(
            %{
              server_id: server.id,
              name: name,
              type: type
            },
            notify_opts
          )

        Logger.info("Yawp.Servers.Seeder: created #{type} channel #{name}")
        n
      end

            {:ok, List.flatten([server_notifications, role_notifications, channel_notifications])}
  end
end
