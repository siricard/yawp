defmodule Yawp.TestSupport.PresenceHarness do
  @moduledoc false

  alias Yawp.Identity
  alias Yawp.Servers
  alias YawpWeb.Presence

  @spec seed_guest(String.t()) :: String.t()
  def seed_guest(did) when is_binary(did) do
    seed_guest(did, [])
  end

  @spec seed_guest(String.t(), [String.t()]) :: String.t()
  def seed_guest(did, anchors) when is_binary(did) and is_list(anchors) do
    {master_pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)

    identity =
      Ash.Seed.seed!(Identity.Identity, %{
        did: did,
        master_public_key: master_pk,
        anchor_list: anchors
      })

    {:ok, server} = Servers.create_server("Guest-#{System.unique_integer([:positive])}")

    {:ok, channel} =
      Servers.create_channel(
        %{server_id: server.id, name: "general", type: :text},
        authorize?: false
      )

    Ash.Seed.seed!(Servers.Membership, %{
      identity_id: identity.id,
      server_id: server.id,
      role_ids: [],
      kind: :guest
    })

    "server:#{server.id}:channel:#{channel.id}"
  end

  @spec start_tracker(String.t()) :: pid()
  def start_tracker(bare) when is_binary(bare) do
    parent = self()

    pid =
      spawn(fn ->
        {:ok, _} =
          Presence.track(self(), "user:#{bare}", "device-1", %{
            online_at: System.system_time(:second)
          })

        send(parent, :tracked)

        receive do
          :stop -> :ok
        end
      end)

    receive do
      :tracked -> pid
    after
      5000 -> raise "presence track never confirmed"
    end
  end

  @spec stop_tracker(pid()) :: :ok
  def stop_tracker(pid) when is_pid(pid) do
    send(pid, :stop)
    :ok
  end

  @spec present?(String.t(), String.t()) :: boolean()
  def present?(topic, bare) when is_binary(topic) and is_binary(bare) do
    Map.has_key?(Presence.list(topic), bare)
  end

  @spec presence_state(String.t(), String.t()) :: String.t() | nil
  def presence_state(topic, bare) when is_binary(topic) and is_binary(bare) do
    case Presence.list(topic)[bare] do
      %{metas: [%{state: state} | _]} -> state
      _ -> nil
    end
  end
end
