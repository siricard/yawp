defmodule Yawp.Servers.ServerInvite.Changes.VerifyServerOwnership do
  @moduledoc """
  gates the `:mint` action on the Ash `actor`:

    1. `context.actor` MUST be a `%Yawp.Identity.Identity{}` — reject
       with `not_authenticated` if nil or wrong shape.
    2. The actor MUST hold the Owner system role on the target
       `server_id` — reject with `not_server_owner` otherwise.

  On success the change stamps `created_by_identity_id` from the
  actor — there is no caller-supplied identity argument anymore.
  """
  use Ash.Resource.Change

  require Ash.Query

  alias Yawp.RpcError
  alias Yawp.Servers

  @impl true
  def change(changeset, _opts, context) do
    actor = context_actor(context)
    server_id = Ash.Changeset.get_argument(changeset, :server_id)

    cond do
      not is_struct(actor, Yawp.Identity.Identity) ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "not_authenticated", message: "not_authenticated")
        )

      not is_owner?(actor.id, server_id) ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "not_server_owner", message: "not_server_owner")
        )

      true ->
        Ash.Changeset.force_change_attribute(changeset, :created_by_identity_id, actor.id)
    end
  end

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil

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
      identity_id == ^identity_id and server_id == ^server_id and ^role_id in role_ids
    )
    |> Ash.read(authorize?: false)
    |> case do
      {:ok, rows} -> rows
      _ -> []
    end
  end
end
