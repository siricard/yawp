defmodule Mook.Call.SessionSupervisorTest do
  use ExUnit.Case, async: true

  alias Mook.Call.Session
  alias Mook.Call.SessionSupervisor

  describe "supervision" do
    test "SessionSupervisor is registered and running under the application supervisor" do
      pid = Process.whereis(SessionSupervisor)
      assert is_pid(pid)
      assert Process.alive?(pid)
    end

    test "SessionSupervisor is a DynamicSupervisor with strategy :one_for_one" do
      %{specs: _, active: _, supervisors: _, workers: _} =
        DynamicSupervisor.count_children(SessionSupervisor)
    end

    test "start_session/1 spawns a Mook.Call.Session under the supervisor" do
      caller_did = "did_caller_#{System.unique_integer([:positive])}"
      peer_did = "did_peer_#{System.unique_integer([:positive])}"

      assert {:ok, pid} =
               SessionSupervisor.start_session(%{caller_did: caller_did, peer_did: peer_did})

      assert is_pid(pid)
      assert Process.alive?(pid)

            children = DynamicSupervisor.which_children(SessionSupervisor)
      pids = for {_, child_pid, _type, _modules} <- children, do: child_pid
      assert pid in pids

            assert %{caller_did: ^caller_did, peer_did: ^peer_did} = Session.get_state(pid)

      :ok = DynamicSupervisor.terminate_child(SessionSupervisor, pid)
    end
  end
end
