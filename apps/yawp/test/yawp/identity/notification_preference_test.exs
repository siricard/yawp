defmodule Yawp.Identity.NotificationPreferenceTest do
  use Yawp.DataCase, async: true

  alias Yawp.Identity

  defp identity! do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  test "resolves the most specific channel preference" do
    identity = identity!()
    server_id = Ecto.UUID.generate()
    channel_id = Ecto.UUID.generate()

    assert {:ok, :mentions_only} =
             Identity.resolve_notification_level(%{
               identity_id: identity.id,
               server_id: server_id,
               channel_id: channel_id
             })

    assert {:ok, _} =
             Identity.upsert_notification_preference(%{
               identity_id: identity.id,
               server_id: server_id,
               level: :muted
             })

    assert {:ok, _} =
             Identity.upsert_notification_preference(%{
               identity_id: identity.id,
               server_id: server_id,
               channel_id: channel_id,
               level: :all
             })

    assert {:ok, :all} =
             Identity.resolve_notification_level(%{
               identity_id: identity.id,
               server_id: server_id,
               channel_id: channel_id
             })
  end

  test "defaults direct messages to all" do
    identity = identity!()

    assert {:ok, :all} =
             Identity.resolve_notification_level(%{
               identity_id: identity.id,
               conversation_id: "conversation-1"
             })
  end

  test "records one push token per identity device and platform" do
    identity = identity!()
    device_subkey_id = Ecto.UUID.generate()

    assert {:ok, first} =
             Identity.upsert_device_push_token(%{
               identity_id: identity.id,
               device_subkey_id: device_subkey_id,
               platform: :apns,
               token: "token-one"
             })

    assert {:ok, second} =
             Identity.upsert_device_push_token(%{
               identity_id: identity.id,
               device_subkey_id: device_subkey_id,
               platform: :apns,
               token: "token-two"
             })

    assert first.id == second.id
    assert second.token == "token-two"
  end
end
