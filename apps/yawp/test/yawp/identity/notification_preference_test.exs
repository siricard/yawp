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
             Identity.upsert_notification_preference(
               %{
                 identity_id: identity.id,
                 server_id: server_id,
                 level: :muted
               },
               actor: identity
             )

    assert {:ok, _} =
             Identity.upsert_notification_preference(
               %{
                 identity_id: identity.id,
                 channel_id: channel_id,
                 level: :all
               },
               actor: identity
             )

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
             Identity.upsert_device_push_token(
               %{
                 identity_id: identity.id,
                 device_subkey_id: device_subkey_id,
                 platform: :apns,
                 token: "token-one"
               },
               actor: identity
             )

    assert {:ok, second} =
             Identity.upsert_device_push_token(
               %{
                 identity_id: identity.id,
                 device_subkey_id: device_subkey_id,
                 platform: :apns,
                 token: "token-two"
               },
               actor: identity
             )

    assert first.id == second.id
    assert second.token == "token-two"
  end

  test "rejects ambiguous notification preference scopes" do
    identity = identity!()

    assert {:error, error} =
             Identity.upsert_notification_preference(
               %{
                 identity_id: identity.id,
                 server_id: Ecto.UUID.generate(),
                 channel_id: Ecto.UUID.generate(),
                 conversation_id: "dm-1",
                 level: :muted
               },
               actor: identity
             )

    assert Exception.message(error) =~ "exactly one notification scope"
  end
end
