defmodule Mook.Call.SessionTest do
  use ExUnit.Case, async: true

  alias Mook.Call.Session

  describe "Session" do
    test "is a GenServer that holds caller/peer DIDs" do
      caller_did = "did_caller_#{System.unique_integer([:positive])}"
      peer_did = "did_peer_#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               start_supervised(
                 {Session, %{caller_did: caller_did, peer_did: peer_did}}
               )

      assert Process.alive?(pid)
      assert %{caller_did: ^caller_did, peer_did: ^peer_did} = Session.get_state(pid)
    end
  end
end
