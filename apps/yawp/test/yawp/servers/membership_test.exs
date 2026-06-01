defmodule Yawp.Servers.MembershipTest do
  @moduledoc """
  `Yawp.Servers.Membership` resource + `assign_role/3`.

  Join row between an Identity and a Server carrying a role-id set.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Servers

  defp seed do
    {:ok, server} = Servers.create_server("Yawp")

    {:ok, role} =
      Servers.create_role(%{
        server_id: server.id,
        name: "Owner",
        system: true
      })

    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

    %{server: server, role: role, identity: identity}
  end

  test "assign_role/3 inserts a membership row" do
    %{server: server, role: role, identity: identity} = seed()

    {:ok, m} = Servers.assign_role(identity.id, server.id, [role.id])

    assert m.identity_id == identity.id
    assert m.server_id == server.id
    assert m.role_ids == [role.id]
    assert m.kind == :anchored
    refute m.banned
    refute m.kicked
  end

  test "re-assigning the same identity/server is idempotent" do
    %{server: server, role: role, identity: identity} = seed()

    {:ok, m1} = Servers.assign_role(identity.id, server.id, [role.id])
    {:ok, m2} = Servers.assign_role(identity.id, server.id, [role.id])

    assert m1.id == m2.id
  end
end
