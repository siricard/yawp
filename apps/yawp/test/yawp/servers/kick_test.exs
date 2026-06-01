defmodule Yawp.Servers.KickTest do
  @moduledoc """
  `Yawp.Servers.Kick` resource + `:kick` action.

  A kick records the moderation event, flips the target membership's
  `kicked` flag, and invalidates every session + refresh token the
  kicked identity holds. Gated by the `kick_members` permission bit.
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

  test "owner kicks a member: records the event, flips kicked, revokes tokens", %{server: server} do
    owner = owner!(server)
    member = member!(server)

    {:ok, %{session_token: session, refresh_token: refresh}} =
      Identity.issue_pair(member.id, Ecto.UUID.generate())

    assert {:ok, kick} =
             Servers.kick_member(%{server_id: server.id, identity_id: member.id, reason: "spam"},
               actor: owner
             )

    assert kick.server_id == server.id
    assert kick.identity_id == member.id
    assert kick.kicked_by_identity_id == owner.id
    assert kick.reason == "spam"

    assert membership(member.id, server.id).kicked == true

    revoked_session =
      Yawp.Identity.SessionToken
      |> Ash.Query.filter(id == ^session.id)
      |> Ash.read_one!(authorize?: false)

    revoked_refresh =
      Yawp.Identity.RefreshToken
      |> Ash.Query.filter(id == ^refresh.id)
      |> Ash.read_one!(authorize?: false)

    assert revoked_session.revoked_at != nil
    assert revoked_refresh.revoked_at != nil
    assert {:error, :invalid_session} = Identity.verify_session(session.token)
  end

  test "kicking an identity that is not a member of this server does not revoke their sessions",
       %{server: server} do
    owner = owner!(server)
    stranger = seed_identity!()

    {:ok, %{session_token: session, refresh_token: refresh}} =
      Identity.issue_pair(stranger.id, Ecto.UUID.generate())

    assert {:ok, _kick} =
             Servers.kick_member(%{server_id: server.id, identity_id: stranger.id}, actor: owner)

    untouched_session =
      Yawp.Identity.SessionToken
      |> Ash.Query.filter(id == ^session.id)
      |> Ash.read_one!(authorize?: false)

    untouched_refresh =
      Yawp.Identity.RefreshToken
      |> Ash.Query.filter(id == ^refresh.id)
      |> Ash.read_one!(authorize?: false)

    assert untouched_session.revoked_at == nil
    assert untouched_refresh.revoked_at == nil
    assert {:ok, _} = Identity.verify_session(session.token)
  end

  test "owner kicks a member by did", %{server: server} do
    owner = owner!(server)
    member = member!(server)

    assert {:ok, kick} =
             Servers.kick_member(%{server_id: server.id, did: member.did}, actor: owner)

    assert kick.identity_id == member.id
    assert membership(member.id, server.id).kicked == true
  end

  test "member without kick_members cannot kick (missing_permission)", %{server: server} do
    _owner = owner!(server)
    member = member!(server)
    victim = member!(server)

    assert {:error, error} =
             Servers.kick_member(%{server_id: server.id, identity_id: victim.id}, actor: member)

    assert error_type(error) == "missing_permission"
    assert membership(victim.id, server.id).kicked == false
  end

  test "nil actor is rejected (not_authenticated)", %{server: server} do
    _owner = owner!(server)
    victim = member!(server)

    assert {:error, error} =
             Servers.kick_member(%{server_id: server.id, identity_id: victim.id})

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
