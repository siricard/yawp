defmodule Yawp.Servers.RedeemRoomInviteRpcTest do
  @moduledoc """
  `:redeem_room_invite` RPC action invoked through
  `AshTypescript.Rpc.run_action/3` against a bare `Plug.Conn` — the
  RPC-everywhere shape of the cold-invite `POST /api/rooms/redeem`
  endpoint.

  Wire shape: `%{"action" => "redeem_room_invite", "input" => %{
    "token" => ..., "did" => ..., "pk" => ..., "senderSignature" => ...
  }}` — fields are camelCase per the ash_typescript input formatter.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers

  require Ash.Query

  setup do
    :ok = Servers.Seeder.run()
    {:ok, server} = Servers.get_singleton_server()

    {:ok, channel} =
      Servers.Channel
      |> Ash.Changeset.for_create(:create, %{
        server_id: server.id,
        name: "secret-rpc",
        type: :text,
        visibility: :private
      })
      |> Ash.create(authorize?: false)

    owner = seed_identity!()
    {:ok, _} = Servers.set_server_owner(server, owner.did)
    {:ok, owner_role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [owner_role.id])

    {:ok, invite} = Servers.create_room_invite(%{channel_id: channel.id}, actor: owner)

    %{server: server, channel: channel, invite: invite}
  end

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp build_input(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    canonical = Yawp.CanonicalJson.encode(%{"token" => token, "did" => did, "pk" => pk_b64})
    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])

    %{
      "token" => token,
      "did" => did,
      "pk" => pk_b64,
      "senderSignature" => Base.url_encode64(sig, padding: false)
    }
  end

  defp run(input) do
    AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
      "action" => "redeem_room_invite",
      "fields" => ["serverId", "channelId", "kind"],
      "input" => input
    })
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp data(result), do: Map.get(result, :data) || Map.get(result, "data")
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  test "cold redeem auto-promotes to guest and returns server/channel/kind",
       %{server: server, channel: channel, invite: invite} do
    input = build_input(invite.token)
    result = run(input)

    assert success?(result) == true
    d = data(result)
    assert (Map.get(d, :serverId) || Map.get(d, "serverId")) == server.id
    assert (Map.get(d, :channelId) || Map.get(d, "channelId")) == channel.id
    assert (Map.get(d, :kind) || Map.get(d, "kind")) == "guest"

    identity = Identity.get_identity_by_did!(input["did"])

    membership =
      Yawp.Servers.Membership
      |> Ash.Query.filter(identity_id == ^identity.id and server_id == ^server.id)
      |> Ash.read_one!(authorize?: false)

    assert membership.kind == :guest
  end

  test "redeem of an unknown token surfaces invite_token_invalid" do
    input = build_input("NOSUCHTOKEN12345678901234")
    result = run(input)

    assert success?(result) == false
    assert "invite_token_invalid" in error_types(result)
  end
end
