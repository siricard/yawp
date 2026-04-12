defmodule Yawp.Identity.Identity.Changes.AssignOwnerRole do
  @moduledoc """
  `after_action` change that grants the
  Owner-role membership for the singleton server to the just-upserted
  chat-owner identity. Idempotent via `Yawp.Servers.Membership`'s
  `:unique_identity_server` upsert identity.

  Runs inside the parent action's transaction; nested-action
  notifications are dispatched by Ash after the outer action commits.
  """
  use Ash.Resource.Change

  alias Yawp.Servers

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, &assign/2)
  end

  defp assign(_changeset, identity) do
    with {:ok, %Servers.Server{} = server} <- get_server(),
         {:ok, %Servers.Role{} = role} <- get_owner_role(server),
         {:ok, _membership} <- Servers.assign_role(identity.id, server.id, role.id) do
      {:ok, identity}
    end
  end

  defp get_server do
    case Servers.get_singleton_server() do
      {:ok, %Servers.Server{} = server} -> {:ok, server}
      {:ok, nil} -> {:error, "singleton server missing — seed did not run"}
    end
  end

  defp get_owner_role(server) do
    case Servers.get_system_role_for_server("Owner", server.id) do
      {:ok, %Servers.Role{} = role} -> {:ok, role}
      {:ok, nil} -> {:error, "Owner system role missing for server #{server.id}"}
    end
  end
end
