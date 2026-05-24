defmodule Yawp.Servers.ServerInvite.Changes.VerifyServerOwnership do
  @moduledoc """
  fix(a) — gates the `:mint` action on the caller being an
  Owner of the target server.

  Verifies that the `created_by_identity_id` argument corresponds to
  an identity that holds the Owner system role on the `server_id`
  argument. Rejects with a `not_server_owner` RPC error otherwise.
  """
  use Ash.Resource.Change

  require Ash.Query

  alias Yawp.RpcError
  alias Yawp.Servers

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(changeset) do
    server_id = Ash.Changeset.get_argument(changeset, :server_id)
    identity_id = Ash.Changeset.get_argument(changeset, :created_by_identity_id)

    if is_owner?(identity_id, server_id) do
      changeset
    else
      Ash.Changeset.add_error(
        changeset,
        RpcError.exception(type: "not_server_owner", message: "not_server_owner")
      )
    end
  end

  defp is_owner?(identity_id, server_id)
       when is_binary(identity_id) and is_binary(server_id) do
    with {:ok, %Servers.Role{} = role} <-
           Servers.get_system_role_for_server("Owner", server_id),
         memberships when is_list(memberships) <-
           list_memberships(identity_id, server_id, role.id) do
      memberships != []
    else
      _ -> false
    end
  end

  defp is_owner?(_, _), do: false

  defp list_memberships(identity_id, server_id, role_id) do
    Servers.Membership
    |> Ash.Query.filter(
      identity_id == ^identity_id and server_id == ^server_id and role_id == ^role_id
    )
    |> Ash.read(authorize?: false)
    |> case do
      {:ok, rows} -> rows
      _ -> []
    end
  end
end
