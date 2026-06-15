defmodule Yawp.Federation.ClientTest do
  @moduledoc false
  use ExUnit.Case, async: false

  alias Yawp.Federation.Client

  @stub Yawp.Federation.Client

  setup do
    previous = Application.get_env(:yawp, :federation_insecure_peer_hosts, [])
    client_previous = Application.get_env(:yawp, Client, [])

    Application.put_env(:yawp, :federation_insecure_peer_hosts, [])
    Application.put_env(:yawp, Client, req_options: [plug: {Req.Test, @stub}])

    on_exit(fn ->
      Application.put_env(:yawp, :federation_insecure_peer_hosts, previous)
      Application.put_env(:yawp, Client, client_previous)
    end)

    :ok
  end

  test "fetches an anchor-prefixed staging peer over https by default" do
    parent = self()

    Req.Test.stub(@stub, fn conn ->
      send(parent, {:scheme, conn.scheme})
      Req.Test.json(conn, %{"ppe" => %{"did" => "did:yawp:test"}})
    end)

    assert {:ok, %{"did" => "did:yawp:test"}} =
             Client.fetch_ppe!("anchor-a.staging.example", "did:yawp:test")

    assert_receive {:scheme, :https}
  end

  test "fetches an explicitly insecure peer host over http" do
    Application.put_env(:yawp, :federation_insecure_peer_hosts, ["anchor-a.staging.example"])
    parent = self()

    Req.Test.stub(@stub, fn conn ->
      send(parent, {:scheme, conn.scheme})
      Req.Test.json(conn, %{"ppe" => %{"did" => "did:yawp:test"}})
    end)

    assert {:ok, %{"did" => "did:yawp:test"}} =
             Client.fetch_ppe!("anchor-a.staging.example", "did:yawp:test")

    assert_receive {:scheme, :http}
  end
end
