defmodule Yawp.Dev.DmFixturesTest do
  use Yawp.DataCase, async: false

  alias Yawp.Dev.DmFixtures
  alias Yawp.Federation
  alias Yawp.Identity

  test "provisions deterministic browser bundles and accepted peer state" do
    dir = Path.join(System.tmp_dir!(), "yawp-dm-fixtures-#{System.unique_integer([:positive])}")

    assert {:ok, _artifact} =
             DmFixtures.provision(%{
               anchor: :a,
               anchor_url: "http://localhost:4000",
               peer_anchor_url: "http://localhost:4100",
               output_dir: dir
             })

    assert {:ok, artifact} =
             DmFixtures.provision(%{
               anchor: :b,
               anchor_url: "http://localhost:4100",
               peer_anchor_url: "http://localhost:4000",
               output_dir: dir
             })

    assert artifact["anchors"]["a"] == "http://localhost:4000"
    assert artifact["anchors"]["b"] == "http://localhost:4100"
    assert artifact["identities"]["alice"]["serverUrl"] == "http://localhost:4000"
    assert artifact["identities"]["bob"]["serverUrl"] == "http://localhost:4100"

    assert artifact["identities"]["alice"]["localStorage"][
             "yawp.session.v1.http://localhost:4000"
           ]

    assert artifact["identities"]["bob"]["localStorage"]["yawp.session.v1.http://localhost:4100"]

    alice_session =
      Jason.decode!(
        artifact["identities"]["alice"]["localStorage"][
          "yawp.session.v1.http://localhost:4000"
        ]
      )

    bob_session =
      Jason.decode!(
        artifact["identities"]["bob"]["localStorage"][
          "yawp.session.v1.http://localhost:4100"
        ]
      )

    assert %{
             "sessionToken" => alice_session_token,
             "refreshToken" => alice_refresh_token,
             "expiresAt" => alice_expires_at
           } = alice_session

    assert is_binary(alice_session_token)
    assert is_binary(alice_refresh_token)
    assert DateTime.from_iso8601(alice_expires_at)
    assert %{"sessionToken" => bob_session_token} = bob_session
    assert is_binary(bob_session_token)

    assert Path.join(dir, "dm_cast.json") |> File.exists?()

    alice = artifact["identities"]["alice"]["did"]
    bob = artifact["identities"]["bob"]["did"]
    carol = artifact["identities"]["carol"]["did"]
    dave = artifact["identities"]["dave"]["did"]

    assert {:ok, alice_identity} = Identity.get_identity_by_did(alice)
    assert alice_identity.anchor_list == [YawpWeb.Endpoint.url()]
    assert {:ok, %Identity.Identity{id: alice_id}} = Identity.verify_session(alice_session_token)
    assert alice_id == alice_identity.id

    assert {:ok, bob_ppe} = Identity.get_ppe_by_did(bob)
    assert bob_ppe.envelope["anchors"] == ["localhost:4100"]

    assert {:ok, alice_blob} = Identity.get_private_blob_by_did(alice)
    assert %{"accepted_peers" => accepted} = Jason.decode!(alice_blob.ciphertext)
    assert bob in accepted
    assert carol in accepted
    refute dave in accepted

    envelope = %{
      "envelope_id" => "fixture-classification",
      "sender_did" => bob,
      "recipient_dids" => [alice],
      "conversation_id" => Federation.DmEnvelope.conversation_id(bob, [alice]),
      "kind" => "dm"
    }

    assert {:ok, entry} = Federation.append_inbox(alice, envelope)
    refute entry.is_request
  end

  test "anchor :b publishes local users' PPE anchors on its own host" do
    dir = Path.join(System.tmp_dir!(), "yawp-dm-fixtures-b-#{System.unique_integer([:positive])}")

    assert {:ok, artifact} =
             DmFixtures.provision(%{
               anchor: :b,
               anchor_url: "http://localhost:4100",
               peer_anchor_url: "http://localhost:4000",
               output_dir: dir
             })

    bob = artifact["identities"]["bob"]["did"]
    carol = artifact["identities"]["carol"]["did"]
    alice = artifact["identities"]["alice"]["did"]

    assert {:ok, bob_ppe} = Identity.get_ppe_by_did(bob)
    assert bob_ppe.envelope["anchors"] == ["localhost:4100"]

    assert {:ok, carol_ppe} = Identity.get_ppe_by_did(carol)
    assert carol_ppe.envelope["anchors"] == ["localhost:4100"]

    assert {:ok, alice_ppe} = Identity.get_ppe_by_did(alice)
    assert alice_ppe.envelope["anchors"] == ["localhost:4000"]
  end
end
