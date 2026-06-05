defmodule Yawp.Federation.PresenceTwoAnchorTest do
  use ExUnit.Case, async: false

  alias Yawp.Identity
  alias Yawp.Federation.PresenceBroker
  alias Yawp.TestSupport.PresenceHarness
  alias Yawp.TestSupport.TwoAnchor

  @moduletag :two_anchor

  @idle_after_ms 800
  @deadline_ms 30_000

  setup do
    prev = Application.get_env(:yawp, Yawp.Federation.PresenceBroker)
    Application.put_env(:yawp, Yawp.Federation.PresenceBroker, idle_after_ms: @idle_after_ms)

    on_exit(fn ->
      if prev do
        Application.put_env(:yawp, Yawp.Federation.PresenceBroker, prev)
      else
        Application.delete_env(:yawp, Yawp.Federation.PresenceBroker)
      end
    end)

    TwoAnchor.start_pair!()
  end

  defp did_for(pub), do: "did:yawp:" <> Identity.did_from_pubkey(pub)

  defp poll_until(_fun, deadline) when deadline <= 0, do: :timeout

  defp poll_until(fun, deadline) do
    if fun.() do
      :ok
    else
      Process.sleep(200)
      poll_until(fun, deadline - 200)
    end
  end

  test "a presence change at A reaches an isolated guest anchor B over real HTTP", %{a: a, b: b} do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = did_for(pub)
    bare = String.replace_prefix(did, "did:yawp:", "")

    topic = TwoAnchor.call(b, PresenceHarness, :seed_guest, [did, [TwoAnchor.base_url(a)]])

    TwoAnchor.call(a, PresenceHarness, :start_tracker, [bare])
    TwoAnchor.call(a, PresenceBroker, :allow_subscriber, [did, TwoAnchor.base_url(b)])

    subscribe_body = TwoAnchor.sign_on(b, %{"did" => did})

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "subscribed"}}} =
             TwoAnchor.post(a, "/federation/presence/subscribe", subscribe_body)

    assert :ok =
             poll_until(
               fn -> TwoAnchor.call(b, PresenceHarness, :present?, [topic, bare]) end,
               @deadline_ms
             )

    assert TwoAnchor.call(b, PresenceHarness, :presence_state, [topic, bare]) == "online"

    assert :ok =
             poll_until(
               fn ->
                 TwoAnchor.call(b, PresenceHarness, :presence_state, [topic, bare]) == "idle"
               end,
               @deadline_ms
             )
  end

  test "B's subscription is bound to the verified relaying anchor, not an attacker-chosen host",
       %{a: a, b: b} do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = did_for(pub)
    bare = String.replace_prefix(did, "did:yawp:", "")

    topic = TwoAnchor.call(b, PresenceHarness, :seed_guest, [did, [TwoAnchor.host(a)]])
    TwoAnchor.call(a, PresenceHarness, :start_tracker, [bare])
    TwoAnchor.call(a, PresenceBroker, :allow_subscriber, [did, TwoAnchor.host(b)])

    subscribe_body =
      TwoAnchor.sign_on(b, %{"did" => did, "peer_host" => "attacker.example:9"})

    assert {:ok, %Req.Response{status: 200}} =
             TwoAnchor.post(a, "/federation/presence/subscribe", subscribe_body)

    assert :ok =
             poll_until(
               fn -> TwoAnchor.call(b, PresenceHarness, :present?, [topic, bare]) end,
               @deadline_ms
             )
  end

  test "unauthorized subscribe is rejected and does not push diffs", %{a: a, b: b} do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = did_for(pub)
    bare = String.replace_prefix(did, "did:yawp:", "")

    topic = TwoAnchor.call(b, PresenceHarness, :seed_guest, [did, [TwoAnchor.host(a)]])
    TwoAnchor.call(a, PresenceHarness, :start_tracker, [bare])

    subscribe_body = TwoAnchor.sign_on(b, %{"did" => did})

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "unauthorized_presence"}}} =
             TwoAnchor.post(a, "/federation/presence/subscribe", subscribe_body)

    assert :timeout =
             poll_until(
               fn -> TwoAnchor.call(b, PresenceHarness, :present?, [topic, bare]) end,
               1_000
             )
  end

  test "unauthorized notify is rejected and does not update remote presence", %{a: a, b: b} do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = did_for(pub)
    bare = String.replace_prefix(did, "did:yawp:", "")

    topic = TwoAnchor.call(b, PresenceHarness, :seed_guest, [did, ["different.example"]])
    notify_body = TwoAnchor.sign_on(a, %{"did" => did, "state" => "online"})

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "unauthorized_presence"}}} =
             TwoAnchor.post(b, "/federation/presence/notify", notify_body)

    refute TwoAnchor.call(b, PresenceHarness, :present?, [topic, bare])
  end

  test "authorized notify accepts a home anchor stored as a full URL", %{a: a, b: b} do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = did_for(pub)
    bare = String.replace_prefix(did, "did:yawp:", "")

    topic = TwoAnchor.call(b, PresenceHarness, :seed_guest, [did, [TwoAnchor.base_url(a)]])
    notify_body = TwoAnchor.sign_on(a, %{"did" => did, "state" => "online"})

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "noted"}}} =
             TwoAnchor.post(b, "/federation/presence/notify", notify_body)

    assert TwoAnchor.call(b, PresenceHarness, :present?, [topic, bare])
  end
end
