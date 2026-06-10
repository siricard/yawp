defmodule YawpWeb.DmControllerTest do
  use YawpWeb.ConnCase, async: false

  import Yawp.TestSupport.PubKey

  alias Yawp.Federation
  alias Yawp.Identity

  setup do
    Yawp.Federation.ensure_active_server_key!()

    prev = Application.get_env(:yawp, Federation.Client)

    Application.put_env(:yawp, Federation.Client,
      anchor_id: "local.test",
      req_options: [
        plug: fn conn ->
          send(self(), {:federation_http, conn.request_path})
          Req.Test.json(conn, %{"status" => "appended"})
        end
      ]
    )

    on_exit(fn ->
      if prev,
        do: Application.put_env(:yawp, Federation.Client, prev),
        else: Application.delete_env(:yawp, Federation.Client)
    end)

    :ok
  end

  test "same-anchor DM appends locally without federation HTTP", %{conn: conn} do
    {sender_pub, sender_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)
    device_id = "sender-device"
    issued_at = "2026-06-05T00:00:00Z"

    seed_ppe!(sender_did, sender_pub, sender_priv, "Alice", ["local.test"],
      device: {device_id, device_pub, sender_priv, issued_at}
    )

    seed_ppe!(recipient_did, recipient_pub, recipient_priv, "Bob", ["local.test"])

    envelope =
      dm_envelope(sender_did, device_id, device_priv, [recipient_did], %{
        "envelope_id" => "same-anchor-envelope",
        "body" => "hello bob"
      })

    conn = post(conn, ~p"/api/dm/submit", envelope)

    assert %{"status" => "accepted", "deliveries" => [%{"recipients" => [^recipient_did]}]} =
             json_response(conn, 200)

    assert {:ok, [entry]} = Federation.pull_inbox(recipient_did, 0, 10)
    assert entry.envelope_id == "same-anchor-envelope"
    assert entry.identity_id == recipient_did
    assert entry.ciphertext_envelope["body"] == "hello bob"
    assert entry.is_request
    refute_receive {:federation_http, _}
  end

  test "a freshly bound sender with no published PPE can still send a same-anchor DM", %{
    conn: conn
  } do
    {sender_pub, sender_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, _recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)
    device_id = "fresh-device"
    issued_at = "2026-06-05T00:00:00Z"

    # Mirror the real onboard+bind state: the Identity row carries the
    # device delegation and anchor_list, but NO PPE has been published or
    # replicated yet. Previously this made the sender unresolvable and the
    # DM submit returned 422 ("Queued — will send when you reconnect").
    seed_bound_identity!(sender_did, sender_pub, sender_priv,
      device: {device_id, device_pub, issued_at},
      anchors: ["http://local.test"]
    )

    seed_bound_identity!(recipient_did, recipient_pub, nil, anchors: ["http://local.test"])

    envelope =
      dm_envelope(sender_did, device_id, device_priv, [recipient_did], %{
        "envelope_id" => "no-ppe-envelope",
        "body" => "hello from a fresh bind",
        "sender_anchors" => ["local.test"]
      })

    conn = post(conn, ~p"/api/dm/submit", envelope)

    assert %{"status" => "accepted", "deliveries" => [%{"recipients" => [^recipient_did]}]} =
             json_response(conn, 200)

    assert {:ok, [entry]} = Federation.pull_inbox(recipient_did, 0, 10)
    assert entry.envelope_id == "no-ppe-envelope"
    assert entry.ciphertext_envelope["body"] == "hello from a fresh bind"
    refute_receive {:federation_http, _}
  end

  test "accepted private blob peers bypass message requests" do
    {sender_pub, _sender_priv} = user_keypair()
    {recipient_pub, _recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)

    assert {:ok, _} =
             Ash.create(
               Yawp.Identity.PrivateBlob,
               %{
                 did: recipient_did,
                 ciphertext: Jason.encode!(%{"accepted_peers" => [sender_did]}),
                 blob_version: 1
               },
               action: :upsert
             )

    envelope = %{
      "envelope_id" => "accepted-peer-envelope",
      "sender_did" => sender_did,
      "recipient_dids" => [recipient_did],
      "conversation_id" =>
        Yawp.Federation.DmEnvelope.conversation_id(sender_did, [recipient_did]),
      "kind" => "dm"
    }

    assert {:ok, entry} = Federation.append_inbox(recipient_did, envelope)
    refute entry.is_request
  end

  test "accepting a peer request persists where inbox classification reads" do
    {sender_pub, _sender_priv} = user_keypair()
    {_device_pub, device_priv} = user_keypair()
    {recipient_pub, _recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)

    assert {:ok, recipient} =
             Ash.create(
               Yawp.Identity.Identity,
               %{did: recipient_did, master_public_key: recipient_pub},
               action: :upsert_via_invite,
               authorize?: false
             )

    first =
      dm_envelope(sender_did, "device", device_priv, [recipient_did], %{
        "envelope_id" => "request-before-accept"
      })

    assert {:ok, before_accept} = Federation.append_inbox(recipient_did, first)
    assert before_accept.is_request

    assert {:ok, _} =
             recipient
             |> Ash.Changeset.for_update(:accept_peer_request, %{peer_did: sender_did},
               actor: recipient
             )
             |> Ash.update(authorize?: false)

    second =
      dm_envelope(sender_did, "device", device_priv, [recipient_did], %{
        "envelope_id" => "request-after-accept"
      })

    assert {:ok, after_accept} = Federation.append_inbox(recipient_did, second)
    refute after_accept.is_request
  end

  test "cross-anchor DM wraps and posts once for each remote recipient anchor", %{conn: conn} do
    {sender_pub, sender_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)
    device_id = "sender-device"
    issued_at = "2026-06-05T00:00:00Z"

    seed_ppe!(sender_did, sender_pub, sender_priv, "Alice", ["local.test"],
      device: {device_id, device_pub, sender_priv, issued_at}
    )

    seed_ppe!(recipient_did, recipient_pub, recipient_priv, "Bob", ["remote.test"])

    envelope =
      dm_envelope(sender_did, device_id, device_priv, [recipient_did], %{
        "envelope_id" => "remote-envelope"
      })

    conn = post(conn, ~p"/api/dm/submit", envelope)

    assert %{"status" => "accepted"} = json_response(conn, 200)
    assert_receive {:federation_http, "/federation/inbox/push"}
    refute_receive {:federation_http, _}
    assert {:ok, []} = Federation.pull_inbox(recipient_did, 0, 10)
  end

  test "group DM accepts multiple recipients and derives one conversation id", %{conn: conn} do
    {sender_pub, sender_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    device_id = "sender-device"
    issued_at = "2026-06-05T00:00:00Z"

    seed_ppe!(sender_did, sender_pub, sender_priv, "Alice", ["local.test"],
      device: {device_id, device_pub, sender_priv, issued_at}
    )

    recipients =
      for name <- ["Bob", "Carol", "Dave"] do
        {pub, priv} = user_keypair()
        did = did_for(pub)
        seed_ppe!(did, pub, priv, name, ["local.test"])
        did
      end

    envelope =
      dm_envelope(sender_did, device_id, device_priv, recipients, %{
        "envelope_id" => "group-envelope"
      })

    conn = post(conn, ~p"/api/dm/submit", envelope)

    assert %{"status" => "accepted", "deliveries" => [%{"recipients" => delivered}]} =
             json_response(conn, 200)

    assert Enum.sort(delivered) == Enum.sort(recipients)
    expected_conversation_id = Yawp.Federation.DmEnvelope.conversation_id(sender_did, recipients)

    for recipient <- recipients do
      assert {:ok, [entry]} = Federation.pull_inbox(recipient, 0, 10)
      assert entry.conversation_id == expected_conversation_id
    end

    assert {:ok, states} = Federation.delivery_states_for_envelope("group-envelope")
    assert Enum.sort(Enum.map(states, & &1.recipient_did)) == Enum.sort(recipients)
    assert Enum.all?(states, &(&1.state == :sent))
  end

  test "DM accepts sender whose anchor is the host:port the endpoint listens on", %{conn: conn} do
    prev = Application.get_env(:yawp, Federation.Client)

    Application.put_env(:yawp, Federation.Client,
      req_options: [
        plug: fn conn ->
          send(self(), {:federation_http, conn.request_path})
          Req.Test.json(conn, %{"status" => "appended"})
        end
      ]
    )

    on_exit(fn ->
      if prev,
        do: Application.put_env(:yawp, Federation.Client, prev),
        else: Application.delete_env(:yawp, Federation.Client)
    end)

    http_port = Application.get_env(:yawp, YawpWeb.Endpoint)[:http][:port]
    anchor = "localhost:#{http_port}"

    {sender_pub, sender_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    sender_did = did_for(sender_pub)
    recipient_did = did_for(recipient_pub)
    device_id = "sender-device"
    issued_at = "2026-06-05T00:00:00Z"

    seed_ppe!(sender_did, sender_pub, sender_priv, "Alice", [anchor],
      device: {device_id, device_pub, sender_priv, issued_at}
    )

    seed_ppe!(recipient_did, recipient_pub, recipient_priv, "Bob", [anchor])

    envelope =
      dm_envelope(sender_did, device_id, device_priv, [recipient_did], %{
        "envelope_id" => "endpoint-anchor-envelope",
        "sender_anchors" => [anchor]
      })

    conn = post(conn, ~p"/api/dm/submit", envelope)

    assert %{"status" => "accepted", "deliveries" => [%{"recipients" => [^recipient_did]}]} =
             json_response(conn, 200)

    assert {:ok, [entry]} = Federation.pull_inbox(recipient_did, 0, 10)
    assert entry.envelope_id == "endpoint-anchor-envelope"
  end

  test "conversation participant mutation endpoints reject immutable rosters", %{conn: conn} do
    conn =
      post(conn, ~p"/api/dm/conversations/conv-immutable/participants", %{
        "recipient_did" => "did:yawp:new"
      })

    assert %{"error" => "conversation_roster_immutable"} = json_response(conn, 409)
  end

  defp user_keypair, do: :crypto.generate_key(:eddsa, :ed25519)

  defp did_for(pub), do: "did:yawp:" <> Yawp.Identity.did_from_pubkey(pub)

  defp seed_ppe!(did, pub, priv, name, anchors, opts \\ []) do
    ppe =
      %{
        "did" => did,
        ("public_" <> "key") => pubkey_b64(pub),
        "profile_version" => System.unique_integer([:positive]),
        "anchors" => anchors,
        "display_name" => name,
        "device_subkeys" => device_subkeys(Keyword.get(opts, :device))
      }
      |> sign_inner("signature", priv)

    assert {:ok, :applied} = Identity.apply_ppe_if_newer(ppe)
    ppe
  end

  defp seed_bound_identity!(did, pub, master_priv, opts) do
    subkeys =
      case Keyword.get(opts, :device) do
        {device_id, device_pub, issued_at} ->
          device_subkeys({device_id, device_pub, master_priv, issued_at})

        nil ->
          []
      end

    Ash.Seed.seed!(Yawp.Identity.Identity, %{
      did: did,
      master_public_key: pub,
      anchor_list: Keyword.get(opts, :anchors, []),
      device_subkeys: %{"subkeys" => subkeys}
    })
  end

  defp device_subkeys(nil), do: []

  defp device_subkeys({device_id, device_pub, master_priv, issued_at}) do
    pk = pubkey_b64(device_pub)

    signature =
      %{"device_id" => device_id, "pk" => pk, "issued_at" => issued_at}
      |> Yawp.CanonicalJson.encode()
      |> then(&:crypto.sign(:eddsa, :none, &1, [master_priv, :ed25519]))
      |> Base.url_encode64(padding: false)

    [%{"device_id" => device_id, "pk" => pk, "issued_at" => issued_at, "signature" => signature}]
  end

  defp dm_envelope(sender_did, device_id, device_priv, recipients, overrides) do
    envelope =
      Map.merge(
        %{
          "envelope_id" => "env-#{System.unique_integer([:positive])}",
          "sender_did" => sender_did,
          "signed_by" => device_id,
          "recipient_dids" => recipients,
          "conversation_id" => Yawp.Federation.DmEnvelope.conversation_id(sender_did, recipients),
          "timestamp" => "2026-06-05T00:00:01.000Z",
          "body" => "hello",
          "attachments" => [],
          "reply_to" => nil,
          "mentions" => [],
          "kind" => "dm",
          "sender_anchors" => ["local.test"],
          "sender_profile_version" => 1
        },
        overrides
      )

    sign_inner(envelope, "sender_signature", device_priv)
  end

  defp sign_inner(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, Base.url_encode64(sig, padding: false))
  end
end
