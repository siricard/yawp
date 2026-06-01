defmodule Yawp.Servers.ChannelTest do
  use Yawp.DataCase, async: false

  alias Yawp.Servers

  setup do
    {:ok, server} = Servers.create_server("Yawp")
    %{server: server}
  end

  test "create_channel/1 inserts a text channel", %{server: server} do
    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    assert channel.server_id == server.id
    assert channel.name == "general"
    assert channel.type == :text
  end

  test "create_channel/1 inserts a voice channel", %{server: server} do
    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "General", type: :voice},
        authorize?: false
      )

    assert channel.type == :voice
  end

  test "create_channel/1 rejects an unknown type", %{server: server} do
    assert {:error, _err} =
             Servers.create_channel(
               %{server_id: server.id, name: "x", type: :badtype},
               authorize?: false
             )
  end

  test "unique_server_id_name identity rejects duplicates", %{server: server} do
    {:ok, _ch} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    assert {:error, _err} =
             Servers.create_channel(
               %{server_id: server.id, name: "general", type: :text},
               authorize?: false
             )
  end
end
