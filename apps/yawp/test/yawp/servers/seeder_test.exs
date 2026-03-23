defmodule Yawp.Servers.SeederTest do
  use Yawp.DataCase, async: false

  alias Yawp.Servers
  alias Yawp.Servers.Seeder

  test "seeds 1 server + 3 system roles + 2 default channels on empty DB" do
    assert :ok = Seeder.run()

    {:ok, [server]} = Servers.list_servers()

    roles = Servers.list_roles_for_server(server.id)
    role_names = Enum.map(roles, & &1.name) |> Enum.sort()
    assert role_names == ["Admin", "Member", "Owner"]
    assert Enum.all?(roles, & &1.system)

    require Ash.Query

    channels =
      Yawp.Servers.Channel
      |> Ash.Query.filter(server_id == ^server.id)
      |> Ash.read!()

    channels_by_type = Enum.group_by(channels, & &1.type, & &1.name)
    assert channels_by_type[:text] == ["general"]
    assert channels_by_type[:voice] == ["General"]
  end

  test "is idempotent on re-run" do
    assert :ok = Seeder.run()
    assert :ok = Seeder.run()

    {:ok, servers} = Servers.list_servers()
    assert length(servers) == 1

    roles = Servers.list_roles_for_server(hd(servers).id)
    assert length(roles) == 3
  end

  test "concurrent invocations don't double-seed" do
    1..4
    |> Task.async_stream(fn _ -> Seeder.run() end, max_concurrency: 4, timeout: 10_000)
    |> Stream.run()

    {:ok, servers} = Servers.list_servers()
    assert length(servers) == 1
  end
end
