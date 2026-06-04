defmodule Yawp.Federation.TwoAnchorTest do
  use ExUnit.Case, async: false

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

  test "a user-signed PPE signed on A round-trips to B over real sockets", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = did_for(pub)

    ppe =
      %{
        "did" => did,
        "profile_version" => 4,
        "public_key" => Base.url_encode64(pub, padding: false),
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
        "public_key" => Base.url_encode64(pub, padding: false),
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
        "public_key" => Base.url_encode64(pub, padding: false)
      }
      |> sign_inner("signature", priv)

    body = TwoAnchor.sign_on(a, blob)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "applied"}}} =
             TwoAnchor.post(b, "/federation/blob/push", body)

    assert {:ok, stored} = TwoAnchor.call(b, Yawp.Identity, :get_private_blob_by_did, [did])
    assert stored.blob_version == 7
    assert stored.ciphertext == ciphertext
  end

  test "an inbox envelope pushed to B is retrievable via a pull from B", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = "did:yawp:two-anchor-inbox"
    env_id = "env-#{System.unique_integer([:positive])}"

    envelope =
      %{
        "envelope_id" => env_id,
        "sender_did" => did_for(pub),
        "public_key" => Base.url_encode64(pub, padding: false),
        "recipient_did" => did,
        "conversation_id" => "conv-xa",
        "kind" => "dm"
      }
      |> sign_inner("sender_signature", priv)

    body = TwoAnchor.sign_on(a, envelope)

    assert {:ok, %Req.Response{status: 200, body: %{"status" => "appended"}}} =
             TwoAnchor.post(b, "/federation/inbox/push", body)

    pull_body =
      TwoAnchor.sign_on(a, %{"recipient_did" => did, "since_serial" => 0})

    assert {:ok, %Req.Response{status: 200, body: %{"envelopes" => [pulled]}}} =
             TwoAnchor.post(b, "/federation/pull", pull_body)

    assert pulled["envelope_id"] == env_id
    assert pulled["conversation_id"] == "conv-xa"
  end

  test "a replayed wrapper is rejected by the receiving anchor", %{a: a, b: b} do
    {pub, priv} = user_keypair()
    did = did_for(pub)

    ppe =
      %{
        "did" => did,
        "profile_version" => 1,
        "public_key" => Base.url_encode64(pub, padding: false),
        "anchors" => [TwoAnchor.host(a)],
        "display_name" => "Once"
      }
      |> sign_inner("signature", priv)

    body = TwoAnchor.sign_on(a, ppe)

    assert {:ok, %Req.Response{status: 200}} = TwoAnchor.post(b, "/federation/ppe/push", body)
    assert {:ok, %Req.Response{status: 409}} = TwoAnchor.post(b, "/federation/ppe/push", body)
  end
end
