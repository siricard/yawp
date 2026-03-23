defmodule Yawp.Servers.RoleTest do
  use Yawp.DataCase, async: false

  alias Yawp.Servers

  setup do
    {:ok, server} = Servers.create_server("Yawp")
    %{server: server}
  end

  test "create_role/1 inserts a system role with the given name", %{server: server} do
    {:ok, role} =
      Servers.create_role(%{server_id: server.id, name: "Owner", system: true, permissions: %{}})

    assert role.server_id == server.id
    assert role.name == "Owner"
    assert role.system == true
    assert role.permissions == %{}
  end

  test "unique_server_id_name identity rejects duplicates", %{server: server} do
    {:ok, _role} =
      Servers.create_role(%{server_id: server.id, name: "Owner", system: true})

    assert {:error, _err} =
             Servers.create_role(%{server_id: server.id, name: "Owner", system: true})
  end

  test "get_system_role_for_server/2 returns the named system role", %{server: server} do
    {:ok, role} =
      Servers.create_role(%{server_id: server.id, name: "Owner", system: true})

    found = Servers.get_system_role_for_server("Owner", server.id)
    assert found.id == role.id
  end

  test "get_system_role_for_server/2 returns nil when missing", %{server: server} do
    assert Servers.get_system_role_for_server("Owner", server.id) == nil
  end
end
