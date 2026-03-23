defmodule Yawp.Servers.ServerTest do
  use Yawp.DataCase, async: false

  alias Yawp.Servers

  test "create_server/1 inserts a row with name + timestamps" do
    {:ok, server} = Servers.create_server("Yawp")

    assert is_binary(server.id)
    assert server.name == "Yawp"
    assert %DateTime{} = server.inserted_at
    assert %DateTime{} = server.updated_at
  end

  test "list_servers/0 returns empty list when no server has been seeded" do
    assert {:ok, []} = Servers.list_servers()
  end

  test "get_singleton_server/0 returns {:ok, nil} when empty, and the server when seeded" do
    assert {:ok, nil} = Servers.get_singleton_server()

    {:ok, server} = Servers.create_server("Yawp")
    {:ok, fetched} = Servers.get_singleton_server()
    assert fetched.id == server.id
  end
end
