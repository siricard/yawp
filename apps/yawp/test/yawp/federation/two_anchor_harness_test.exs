defmodule Yawp.Federation.TwoAnchorHarnessTest do
  use ExUnit.Case, async: false

  alias Yawp.TestSupport.TwoAnchor

  @moduletag :two_anchor

  defp unique_did(suffix), do: "did:yawp:harness-#{suffix}-#{System.unique_integer([:positive])}"

  defp ppe(did, anchor, version, name) do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)

    %{
      "did" => did,
      "profile_version" => version,
      "public_key" => Base.url_encode64(pub, padding: false),
      "anchors" => [TwoAnchor.host(anchor)],
      "display_name" => name
    }
  end

  defp signed_ppe(anchor, version, name) do
    {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pub)

    payload = %{
      "did" => did,
      "profile_version" => version,
      "public_key" => Base.url_encode64(pub, padding: false),
      "anchors" => [TwoAnchor.host(anchor)],
      "display_name" => name
    }

    canonical = Yawp.CanonicalJson.encode(payload)
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    {did, Map.put(payload, "signature", Base.url_encode64(sig, padding: false))}
  end

  describe "cross-anchor transport with isolated anchors" do
    setup do
      TwoAnchor.start_pair!()
    end

    test "each anchor publishes its own distinct server key", %{a: a, b: b} do
      refute a.key_id == b.key_id

      doc_a = Req.get!(url: TwoAnchor.base_url(a) <> "/.well-known/yawp/server-key.json").body
      doc_b = Req.get!(url: TwoAnchor.base_url(b) <> "/.well-known/yawp/server-key.json").body

      key_ids_a = Enum.map(doc_a["keys"], & &1["key_id"])
      key_ids_b = Enum.map(doc_b["keys"], & &1["key_id"])

      assert a.key_id in key_ids_a
      assert b.key_id in key_ids_b
      refute a.key_id in key_ids_b
      refute b.key_id in key_ids_a
    end

    test "a PPE signed on A and POSTed to B is verified by B against A's published key", %{
      a: a,
      b: b
    } do
      {did, payload} = signed_ppe(a, 4, "Alice")
      body = TwoAnchor.sign_on(a, payload)

      assert {:ok, %Req.Response{status: 200, body: %{"status" => "applied"}}} =
               TwoAnchor.post(b, "/federation/ppe/push", body)

      assert {:ok, stored} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [did])
      assert stored.profile_version == 4
      assert stored.display_name == "Alice"
    end

    test "a row written directly to A's database is invisible to B without a federation hop", %{
      a: a,
      b: b
    } do
      did = unique_did("isolation")

      assert {:ok, :applied} =
               TwoAnchor.call(a, Yawp.Identity, :apply_ppe_if_newer, [ppe(did, a, 9, "OnlyOnA")])

      assert {:ok, written} = TwoAnchor.call(a, Yawp.Identity, :get_ppe_by_did, [did])
      assert written.profile_version == 9

      assert {:ok, nil} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [did])
    end

    test "signing_fn signs with the anchor's own active key", %{a: a, b: b} do
      {signature, key_id} = TwoAnchor.signing_fn(a).(%{"hello" => "from-a", "n" => 7})

      assert key_id == a.key_id
      assert byte_size(signature) == 64
      refute key_id == b.key_id
    end
  end

  describe "B rejects a payload whose signing key is no longer valid on A" do
    setup do
      TwoAnchor.start_pair!()
    end

    test "revoking A's key makes B reject A's previously-signed payload", %{a: a, b: b} do
      did = unique_did("revoked")
      body = TwoAnchor.sign_on(a, ppe(did, a, 2, "Mallory"))

      {:ok, key} = TwoAnchor.call(a, Yawp.Federation, :get_active_server_key, [])
      {:ok, _revoked} = TwoAnchor.call(a, Yawp.Federation, :revoke_server_key, [key])
      :ok = TwoAnchor.call(b, Yawp.Federation.KeyDocCache, :clear, [])

      assert {:ok, %Req.Response{status: 401, body: %{"error" => "invalid_signature"}}} =
               TwoAnchor.post(b, "/federation/ppe/push", body)

      assert {:ok, nil} = TwoAnchor.call(b, Yawp.Identity, :get_ppe_by_did, [did])
    end
  end
end
