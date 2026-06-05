defmodule Yawp.Federation.TwoAnchorTest do
  use ExUnit.Case, async: false

  import Yawp.TestSupport.PubKey

  alias Yawp.TestSupport.TwoAnchor

  @moduletag :two_anchor

  setup do
    TwoAnchor.start_pair!()
  end

  defp user_keypair, do: :crypto.generate_key(:eddsa, :ed25519)

  defp did_for(pub), do: "did:yawp:" <> Yawp.Identity.did_from_pubkey(pub)

  defp sign_inner(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, Base.url_encode64(sig, padding: false))
  end

  defp device_delegation_signature(device_id, device_pub, issued_at, master_priv) do
    canonical =
      Yawp.CanonicalJson.encode(%{
        "device_id" => device_id,
        "pk" => Base.url_encode64(device_pub, padding: false),
        "issued_at" => issued_at
      })

    :crypto.sign(:eddsa, :none, canonical, [master_priv, :ed25519])
    |> Base.url_encode64(padding: false)
  end

  defp sign_server_inner(anchor, payload) do
    {:ok, active} = TwoAnchor.call(anchor, Yawp.Federation, :get_active_server_key, [])

    payload = Map.put(payload, "signed_by", active.key_id)

    {:ok, signature, key_id} =
      TwoAnchor.call(anchor, Yawp.Federation, :sign, [
        Map.delete(payload, "source_server_signature")
      ])

    payload
    |> Map.put("signed_by", key_id)
    |> Map.put("source_server_signature", Base.url_encode64(signature, padding: false))
  end

  defp signed_ppe(did, master_pub, master_priv, anchors, device_subkeys \\ []) do
    %{
      "did" => did,
      "profile_version" => 1,
      ("public_" <> "key") => pubkey_b64(master_pub),
      "anchors" => anchors,
      "display_name" => "User #{System.unique_integer([:positive])}",
      "device_subkeys" => device_subkeys
    }
    |> sign_inner("signature", master_priv)
  end

  defp delegated_device(device_id, device_pub, issued_at, master_priv) do
    %{
      "device_id" => device_id,
      "pk" => Base.url_encode64(device_pub, padding: false),
      "signature" => device_delegation_signature(device_id, device_pub, issued_at, master_priv),
      "issued_at" => issued_at
    }
  end

  test "a user-signed PPE signed on A round-trips to B over real sockets", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = did_for(pub)

    ppe =
      %{
        "did" => did,
        "profile_version" => 4,
        ("public_" <> "key") => pubkey_b64(pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice",
        "bio" => "hello from A"
      }
      |> sign_inner("signature", priv)

    body = TwoAnchor.sign_on(a, ppe)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "applied"}}} =
             TwoAnchor.post(b, "/federation/ppe/push", body)

    assert {:ok, stored} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [did])
    assert stored.profile_version == 4
    assert stored.display_name == "Alice"
    assert stored.envelope["bio"] == "hello from A"

    assert {:ok, nil} = TwoAnchor.call(a, Yawp.Identity, :get_ppe_by_did, [did])
  end

  test "B rejects a PPE whose inner user signature is forged, even from a trusted anchor", %{
    a: a,
    b: b
  } do
    {pub, priv} = user_keypair()
    did = did_for(pub)

    ppe =
      %{
        "did" => did,
        "profile_version" => 1,
        ("public_" <> "key") => pubkey_b64(pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice"
      }
      |> sign_inner("signature", priv)
      |> Map.put("display_name", "Mallory")

    body = TwoAnchor.sign_on(a, ppe)

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "invalid_inner_signature"}}} =
             TwoAnchor.post(b, "/federation/ppe/push", body)

    assert {:ok, nil} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [did])
  end

  test "a user-signed private blob round-trips byte-identically from A to B", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = did_for(pub)
    ciphertext = :crypto.strong_rand_bytes(64)

    blob =
      %{
        "did" => did,
        "ciphertext" => Base.encode64(ciphertext),
        "blob_version" => 7,
        ("public_" <> "key") => pubkey_b64(pub)
      }
      |> sign_inner("signature", priv)

    body = TwoAnchor.sign_on(a, blob)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "applied"}}} =
             TwoAnchor.post(b, "/federation/blob/push", body)

    assert {:ok, stored} = TwoAnchor.call(b, Yawp.Identity, :get_private_blob_by_did, [did])
    assert stored.blob_version == 7
    assert stored.ciphertext == ciphertext
  end

  test "a device-signed DM verified against the sender's federated PPE round-trips A→B",
       %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    device_id = "device-xa"
    issued_at = "2026-01-01T00:00:00Z"
    sender_did = did_for(master_pub)
    recipient = did_for(recipient_pub)
    env_id = "env-#{System.unique_integer([:positive])}"

    ppe =
      %{
        "did" => sender_did,
        "profile_version" => 2,
        ("public_" <> "key") => pubkey_b64(master_pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice",
        "device_subkeys" => [
          %{
            "device_id" => device_id,
            "pk" => Base.url_encode64(device_pub, padding: false),
            "signature" =>
              device_delegation_signature(device_id, device_pub, issued_at, master_priv),
            "issued_at" => issued_at
          }
        ]
      }
      |> sign_inner("signature", master_priv)

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [ppe])
    recipient_ppe = signed_ppe(recipient, recipient_pub, recipient_priv, [TwoAnchor.host(b)])

    assert {:ok, :applied} =
             TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [recipient_ppe])

    assert {:ok, nil} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [sender_did])

    envelope =
      %{
        "envelope_id" => env_id,
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_did" => recipient,
        "conversation_id" => "conv-xa",
        "kind" => "dm",
        "sender_profile_version" => 2,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "appended"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, fetched} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [sender_did])
    assert fetched.display_name == "Alice"

    pull_body =
      TwoAnchor.sign_on(a, %{"recipient_did" => recipient, "since_serial" => 0})

    assert {:ok, %Req.Response{status: 200, body: %{"envelopes" => [pulled]}}} =
             TwoAnchor.post(b, "/federation/pull", pull_body)

    assert pulled["envelope_id"] == env_id
    assert pulled["conversation_id"] == "conv-xa"
  end

  test "sender anchor refuses to relay a DM for a sender it does not anchor", %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    device_id = "device-open-relay"
    issued_at = "2026-01-01T00:00:00Z"
    sender_did = did_for(master_pub)

    ppe =
      signed_ppe(sender_did, master_pub, master_priv, [TwoAnchor.host(b)], [
        delegated_device(device_id, device_pub, issued_at, master_priv)
      ])

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_dids" => ["did:yawp:relay-target"],
        "conversation_id" => "conv-open-relay",
        "kind" => "dm",
        "sender_profile_version" => 1,
        "sender_anchors" => [TwoAnchor.host(b)]
      }
      |> sign_inner("sender_signature", device_priv)

    assert {:error, :sender_not_anchored_here} =
             TwoAnchor.call(a, Yawp.Federation, :submit_dm, [envelope])

    assert {:ok, []} =
             TwoAnchor.call(b, Yawp.Federation, :pull_inbox, ["did:yawp:relay-target", 0, 100])
  end

  test "federated inbox delivery persists the verified wrapper signature", %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    device_id = "device-wrapper-sig"
    issued_at = "2026-01-01T00:00:00Z"
    sender_did = did_for(master_pub)
    recipient = did_for(recipient_pub)

    sender_ppe =
      signed_ppe(sender_did, master_pub, master_priv, [TwoAnchor.host(a)], [
        delegated_device(device_id, device_pub, issued_at, master_priv)
      ])

    recipient_ppe = signed_ppe(recipient, recipient_pub, recipient_priv, [TwoAnchor.host(b)])

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [sender_ppe])

    assert {:ok, :applied} =
             TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [recipient_ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_did" => recipient,
        "conversation_id" => "conv-wrapper-sig",
        "kind" => "dm",
        "sender_profile_version" => 1,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, [entry]} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
    assert is_binary(entry.wrapper_signature)
    assert byte_size(entry.wrapper_signature) > 0
  end

  test "recipient anchor skips a single recipient it is not authoritative for", %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    device_id = "device-single-authority"
    issued_at = "2026-01-01T00:00:00Z"
    sender_did = did_for(master_pub)
    recipient = did_for(recipient_pub)

    sender_ppe =
      signed_ppe(sender_did, master_pub, master_priv, [TwoAnchor.host(a)], [
        delegated_device(device_id, device_pub, issued_at, master_priv)
      ])

    recipient_ppe = signed_ppe(recipient, recipient_pub, recipient_priv, [TwoAnchor.host(a)])

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [sender_ppe])

    assert {:ok, :applied} =
             TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [recipient_ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_did" => recipient,
        "conversation_id" => "conv-single-authority",
        "kind" => "dm",
        "sender_profile_version" => 1,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "appended"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, []} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
  end

  test "recipient anchor appends only recipients it is authoritative for", %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    {bob_pub, bob_priv} = user_keypair()
    {carol_pub, carol_priv} = user_keypair()
    device_id = "device-authority"
    issued_at = "2026-01-01T00:00:00Z"
    sender_did = did_for(master_pub)
    bob_did = did_for(bob_pub)
    carol_did = did_for(carol_pub)

    sender_ppe =
      signed_ppe(sender_did, master_pub, master_priv, [TwoAnchor.host(a)], [
        delegated_device(device_id, device_pub, issued_at, master_priv)
      ])

    bob_ppe = signed_ppe(bob_did, bob_pub, bob_priv, [TwoAnchor.host(b)])
    carol_ppe = signed_ppe(carol_did, carol_pub, carol_priv, [TwoAnchor.host(a)])

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [sender_ppe])
    assert {:ok, :applied} = TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [bob_ppe])
    assert {:ok, :applied} = TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [carol_ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_dids" => [bob_did, carol_did],
        "conversation_id" => "conv-authority",
        "kind" => "dm",
        "sender_profile_version" => 1,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, [bob_entry]} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [bob_did, 0, 100])
    assert bob_entry.envelope_id == envelope["envelope_id"]
    assert {:ok, []} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [carol_did, 0, 100])
  end

  test "B refreshes stale cached PPE before rejecting a newly bound DM device",
       %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {old_device_pub, _old_device_priv} = user_keypair()
    {new_device_pub, new_device_priv} = user_keypair()
    {recipient_pub, recipient_priv} = user_keypair()
    old_device_id = "device-old"
    new_device_id = "device-new"
    old_issued_at = "2026-01-01T00:00:00Z"
    new_issued_at = "2026-01-02T00:00:00Z"
    sender_did = did_for(master_pub)
    recipient = did_for(recipient_pub)

    cached_ppe =
      %{
        "did" => sender_did,
        "profile_version" => 1,
        ("public_" <> "key") => pubkey_b64(master_pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice",
        "device_subkeys" => [
          %{
            "device_id" => old_device_id,
            "pk" => Base.url_encode64(old_device_pub, padding: false),
            "signature" =>
              device_delegation_signature(
                old_device_id,
                old_device_pub,
                old_issued_at,
                master_priv
              ),
            "issued_at" => old_issued_at
          }
        ]
      }
      |> sign_inner("signature", master_priv)

    fresh_ppe =
      put_in(cached_ppe, ["profile_version"], 2)
      |> put_in(["device_subkeys"], [
        hd(cached_ppe["device_subkeys"]),
        %{
          "device_id" => new_device_id,
          "pk" => Base.url_encode64(new_device_pub, padding: false),
          "signature" =>
            device_delegation_signature(new_device_id, new_device_pub, new_issued_at, master_priv),
          "issued_at" => new_issued_at
        }
      ])
      |> sign_inner("signature", master_priv)

    assert {:ok, :applied} = TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [cached_ppe])
    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [fresh_ppe])
    recipient_ppe = signed_ppe(recipient, recipient_pub, recipient_priv, [TwoAnchor.host(b)])

    assert {:ok, :applied} =
             TwoAnchor.call(b, Yawp.Identity, :apply_ppe_if_newer, [recipient_ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => new_device_id,
        "recipient_did" => recipient,
        "conversation_id" => "conv-stale-refresh",
        "kind" => "dm",
        "sender_profile_version" => 2,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", new_device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "appended"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, refreshed} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [sender_did])
    assert refreshed.profile_version == 2
    assert {:ok, [entry]} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
    assert entry.envelope_id == envelope["envelope_id"]
  end

  test "B rejects a DM whose published device delegation is forged",
       %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, device_priv} = user_keypair()
    device_id = "device-forged-delegation"
    sender_did = did_for(master_pub)
    recipient = "did:yawp:two-anchor-forged-delegation"

    ppe =
      %{
        "did" => sender_did,
        "profile_version" => 1,
        ("public_" <> "key") => pubkey_b64(master_pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice",
        "device_subkeys" => [
          %{
            "device_id" => device_id,
            "pk" => Base.url_encode64(device_pub, padding: false),
            "signature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false),
            "issued_at" => "2026-01-01T00:00:00Z"
          }
        ]
      }
      |> sign_inner("signature", master_priv)

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => device_id,
        "recipient_did" => recipient,
        "conversation_id" => "conv-forged-delegation",
        "kind" => "dm",
        "sender_profile_version" => 1,
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", device_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "invalid_inner_signature"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, []} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
  end

  test "B rejects a DM whose signing device is not a published subkey of the sender",
       %{a: a, b: b} do
    {master_pub, master_priv} = user_keypair()
    {device_pub, _device_priv} = user_keypair()
    {_rogue_pub, rogue_priv} = user_keypair()
    device_id = "device-real"
    sender_did = did_for(master_pub)
    recipient = "did:yawp:two-anchor-rogue"

    ppe =
      %{
        "did" => sender_did,
        "profile_version" => 1,
        ("public_" <> "key") => pubkey_b64(master_pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Alice",
        "device_subkeys" => [
          %{
            "device_id" => device_id,
            "pk" => Base.url_encode64(device_pub, padding: false),
            "signature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false),
            "issued_at" => "2026-01-01T00:00:00Z"
          }
        ]
      }
      |> sign_inner("signature", master_priv)

    assert {:ok, :applied} = TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [ppe])

    envelope =
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => sender_did,
        "signed_by" => "device-rogue",
        "recipient_did" => recipient,
        "conversation_id" => "conv-rogue",
        "kind" => "dm",
        "sender_anchors" => [TwoAnchor.host(a)]
      }
      |> sign_inner("sender_signature", rogue_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "invalid_inner_signature"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, []} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
  end

  test "a source-server-signed notification envelope round-trips A→B", %{a: a, b: b} do
    recipient = "did:yawp:two-anchor-notification"

    envelope =
      sign_server_inner(a, %{
        "envelope_id" => "notif-#{System.unique_integer([:positive])}",
        "kind" => "notification",
        "user_did" => recipient,
        "source_kind" => "room_mention",
        "source_server" => TwoAnchor.host(a),
        "room_id_or_thread_id" => "room-#{System.unique_integer([:positive])}",
        "message_id" => "msg-#{System.unique_integer([:positive])}",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601()
      })

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "appended"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, [entry]} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
    assert entry.kind == "notification"
    assert entry.envelope_id == envelope["envelope_id"]
  end

  test "B rejects a notification envelope not signed by the source server", %{a: a, b: b} do
    {_pub, rogue_priv} = user_keypair()
    recipient = "did:yawp:two-anchor-bad-notification"

    envelope =
      %{
        "envelope_id" => "notif-#{System.unique_integer([:positive])}",
        "kind" => "notification",
        "signed_by" => a.key_id,
        "user_did" => recipient,
        "source_kind" => "room_message",
        "source_server" => TwoAnchor.host(a),
        "room_id_or_thread_id" => "room-bad",
        "message_id" => "msg-bad",
        "timestamp" => DateTime.utc_now() |> DateTime.to_iso8601()
      }
      |> sign_inner("source_server_signature", rogue_priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 403, body: %{"error" => "invalid_inner_signature"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    assert {:ok, []} = TwoAnchor.call(b, Yawp.Federation, :pull_inbox, [recipient, 0, 100])
  end

  test "a replayed wrapper is rejected by the receiving anchor", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = did_for(pub)

    ppe =
      %{
        "did" => did,
        "profile_version" => 1,
        ("public_" <> "key") => pubkey_b64(pub),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Once"
      }
      |> sign_inner("signature", priv)

    body = TwoAnchor.sign_on(a, ppe)

    assert {:ok, %Req.Response{status: 200}} = TwoAnchor.post(b, "/federation/ppe/push", body)
    assert {:ok, %Req.Response{status: 409}} = TwoAnchor.post(b, "/federation/ppe/push", body)
  end
end
