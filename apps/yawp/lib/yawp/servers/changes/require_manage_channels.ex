defmodule Yawp.Servers.Changes.RequireManageChannels do
  @moduledoc """
  Gates a channel/category mutation on the `manage_channels` permission
  bit.

  A present actor MUST be a `Yawp.Identity.Identity` holding
  `manage_channels` on the target server, resolved via
  `Yawp.Servers.Permissions.effective_bits/3`. A `nil` actor is rejected
  with `not_authenticated` on any authorized call — only an explicit
  authorization bypass (the boot seeder and trusted server-side callers
  that pass `authorize?: false`) skips the gate.

  The target server is read from the changeset's `server_id` attribute,
  a `server_id` argument, or the underlying record being updated.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError
  alias Yawp.Servers.Permissions

  @impl true
  def change(changeset, _opts, context) do
    cond do
      bypass?(context) ->
        changeset

      match?(%Yawp.Identity.Identity{}, context_actor(context)) ->
        gate(changeset, context_actor(context))

      true ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "not_authenticated", message: "not_authenticated")
        )
    end
  end

  defp bypass?(%{authorize?: false}), do: true
  defp bypass?(_), do: false

  defp gate(changeset, actor) do
    with {:ok, server} <- resolve_server(changeset),
         true <-
           Permissions.has?(Permissions.effective_bits(actor, server, nil), :manage_channels) do
      changeset
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "missing_permission", message: "manage_channels")
        )
    end
  end

  defp resolve_server(changeset) do
    server_id =
      Ash.Changeset.get_attribute(changeset, :server_id) ||
        Ash.Changeset.get_argument(changeset, :server_id) ||
        record_server_id(changeset)

    case server_id && Ash.get(Yawp.Servers.Server, server_id, authorize?: false) do
      {:ok, server} -> {:ok, server}
      _ -> :error
    end
  end

  defp record_server_id(%{data: %{server_id: server_id}}) when is_binary(server_id),
    do: server_id

  defp record_server_id(_), do: nil

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil
end
