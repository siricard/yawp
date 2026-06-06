defmodule Yawp.Dev.DmFixturesTest do
  use Yawp.DataCase, async: false

  alias Yawp.Dev.DmFixtures
  alias Yawp.Federation
  alias Yawp.Identity

  test "provisions deterministic browser bundles and accepted peer state" do
    dir = Path.join(System.tmp_dir!(), "yawp-dm-fixtures-#{System.unique_integer([:positive])}")

    assert {:ok, artifact} =
             DmFixtures.provision(%{
               anchor: :a,
               anchor_url: "http://localhost:4000",
               peer_anchor_url: "http://localhost:4100",
               output_dir: dir
             })

    assert artifact["anchors"]["a"] == "http://localhost:4000"
    assert artifact["anchors"]["b"] == "http://localhost:4100"
    assert artifact["identities"]["alice"]["serverUrl"] == "http://localhost:4000"
    assert artifact["identities"]["bob"]["serverUrl"] == "http://localhost:4100"

    assert Path.join(dir, "dm_cast.json") |> File.exists?()

    alice = artifact["identities"]["alice"]["did"]
    bob = artifact["identities"]["bob"]["did"]
    carol = artifact["identities"]["carol"]["did"]
    dave = artifact["identities"]["dave"]["did"]

    assert {:ok, alice_identity} = Identity.get_identity_by_did(alice)
    assert alice_identity.anchor_list == [YawpWeb.Endpoint.url()]

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
end
