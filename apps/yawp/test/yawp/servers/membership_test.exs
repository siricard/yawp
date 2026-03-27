defmodule Yawp.Servers.MembershipTest do
  @moduledoc """
  `Yawp.Servers.Membership` resource + `assign_role/3`.

  Minimal join row between an Identity and a Role on a Server.
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
        system: true,
        permissions: %{}
      })

    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    {:ok, identity} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})

    %{server: server, role: role, identity: identity}
  end

  test "assign_role/3 inserts a membership row" do
    %{server: server, role: role, identity: identity} = seed()

    {:ok, m} = Servers.assign_role(identity.id, server.id, role.id)

    assert m.identity_id == identity.id
    assert m.server_id == server.id
    assert m.role_id == role.id
  end

  test "re-assigning the same triple is idempotent" do
    %{server: server, role: role, identity: identity} = seed()

    {:ok, m1} = Servers.assign_role(identity.id, server.id, role.id)
    {:ok, m2} = Servers.assign_role(identity.id, server.id, role.id)

    assert m1.id == m2.id
  end
end
