defmodule Yawp.Federation.PresenceBrokerTest do
  use Yawp.DataCase, async: false

  alias Yawp.Federation.PresenceBroker
  alias YawpWeb.Presence

  defp start_broker(notifier) do
    name = :"presence_broker_#{System.unique_integer([:positive])}"

    pid =
      start_supervised!({PresenceBroker, name: name, notifier: notifier, idle_after_ms: 150})

    %{broker: pid, name: name}
  end

  defp test_notifier do
    test = self()
    fn peer, did, state -> send(test, {:notify, peer, did, state}) end
  end

  defp track_device(did) do
    owner = self()

    pid =
      spawn(fn ->
        {:ok, _} =
          Presence.track(self(), "user:#{did}", "device-#{System.unique_integer([:positive])}", %{
            online_at: System.system_time(:second)
          })

        send(owner, :tracked)

        receive do
          :stop -> :ok
        end
      end)

    receive do
      :tracked -> :ok
    after
      1000 -> flunk("presence track never confirmed")
    end

    pid
  end

  describe "peer subscription" do
    test "an offline user yields an offline push to the subscribing peer" do
      %{name: name} = start_broker(test_notifier())
      did = "offline-#{System.unique_integer([:positive])}"

      :ok = PresenceBroker.subscribe(name, did, "peer-b.example")

      assert_receive {:notify, "peer-b.example", ^did, :offline}, 1000
    end

    test "a user who is online pushes online to a peer that subscribes afterward" do
      %{name: name} = start_broker(test_notifier())
      did = "online-#{System.unique_integer([:positive])}"

      track_device(did)
      :ok = PresenceBroker.subscribe(name, did, "peer-b.example")

      assert_receive {:notify, "peer-b.example", ^did, :online}, 1000
    end

    test "a presence change is pushed to a subscribed peer" do
      %{name: name} = start_broker(test_notifier())
      did = "change-#{System.unique_integer([:positive])}"

      :ok = PresenceBroker.subscribe(name, did, "peer-b.example")
      assert_receive {:notify, "peer-b.example", ^did, :offline}, 1000

      track_device(did)

      assert_receive {:notify, "peer-b.example", ^did, :online}, 1000
    end
  end

  describe "idle detection" do
    test "an online user transitions to idle after the idle window with no activity" do
      %{name: name} = start_broker(test_notifier())
      did = "idle-#{System.unique_integer([:positive])}"

      track_device(did)
      :ok = PresenceBroker.subscribe(name, did, "peer-b.example")

      assert_receive {:notify, "peer-b.example", ^did, :online}, 1000
      assert_receive {:notify, "peer-b.example", ^did, :idle}, 2000
    end
  end
end
