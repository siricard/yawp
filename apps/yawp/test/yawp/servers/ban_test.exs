defmodule Yawp.Servers.BanTest do
  @moduledoc """
  `Yawp.Servers.Ban` resource + `:ban` action.

  A ban records the moderation event and flips the target membership's
  `banned` flag (which short-circuits `effective_bits/3` to 0). Gated by
  the `ban_members` permission bit.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers

  require Ash.Query

  setup do
    :ok = Servers.Seeder.run()
    {:ok, server} = Servers.get_singleton_server()
    %{server: server}
  end

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp owner!(server) do
    owner = seed_identity!()
    {:ok, _} = Servers.set_server_owner(server, owner.did)
    {:ok, role} = Servers.get_system_role_for_server("Owner", server.id)
    {:ok, _} = Servers.assign_role(owner.id, server.id, [role.id])
    owner
  end

  defp member!(server) do
    member = seed_identity!()
    {:ok, role} = Servers.get_system_role_for_server("Member", server.id)
    {:ok, _} = Servers.assign_role(member.id, server.id, [role.id])
    member
  end

  defp membership(identity_id, server_id) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.read_one!(authorize?: false)
  end

  test "owner bans a member: records the event and flips banned", %{server: server} do
    owner = owner!(server)
    member = member!(server)

    assert {:ok, ban} =
             Servers.ban_member(%{server_id: server.id, identity_id: member.id, reason: "abuse"},
               actor: owner
             )

    assert ban.server_id == server.id
    assert ban.identity_id == member.id
    assert ban.banned_by_identity_id == owner.id
    assert ban.reason == "abuse"

    m = membership(member.id, server.id)
    assert m.banned == true

    {:ok, channel} =
      Yawp.Servers.Channel
      |> Ash.Query.filter(server_id == ^server.id and type == :text)
      |> Ash.read_one(authorize?: false)

    assert Yawp.Servers.Permissions.effective_bits(member, server, channel) == 0
  end

  test "member without ban_members cannot ban (missing_permission)", %{server: server} do
    _owner = owner!(server)
    member = member!(server)
    victim = member!(server)

    assert {:error, error} =
             Servers.ban_member(%{server_id: server.id, identity_id: victim.id}, actor: member)

    assert error_type(error) == "missing_permission"
    assert membership(victim.id, server.id).banned == false
  end

  test "nil actor is rejected (not_authenticated)", %{server: server} do
    _owner = owner!(server)
    victim = member!(server)

    assert {:error, error} =
             Servers.ban_member(%{server_id: server.id, identity_id: victim.id})

    assert error_type(error) == "not_authenticated"
  end

  defp error_type(error) do
    cond do
      is_struct(error, Yawp.RpcError) ->
        to_string(error.type)

      is_struct(error, Ash.Error.Invalid) ->
        Enum.find_value(error.errors, fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      is_struct(error, Ash.Error.Forbidden) ->
        Enum.find_value(error.errors, fn
          %Yawp.RpcError{type: t} -> to_string(t)
          _ -> nil
        end)

      true ->
        nil
    end
  end
end
