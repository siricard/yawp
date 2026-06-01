defmodule Yawp.Servers.RoomInvite.Changes.VerifyChannelCreateInvite do
  @moduledoc """
  Gates the `:create_invite` action on the `create_invite` permission
  bit, resolved at the channel level via
  `Yawp.Servers.Permissions.effective_bits/3`.

  Rejects a `nil` actor with `not_authenticated` and an actor lacking the
  bit with `missing_permission`. On success it stamps the invite's
  `channel_id`, `server_id`, and `created_by_identity_id` from the
  resolved channel and actor.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  @impl true
  def change(changeset, _opts, context) do
    case context_actor(context) do
      %Yawp.Identity.Identity{} = actor ->
        gate(changeset, actor)

      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "not_authenticated", message: "not_authenticated")
        )
    end
  end

  defp gate(changeset, actor) do
    channel_id = Ash.Changeset.get_argument(changeset, :channel_id)

    with {:ok, channel} <- fetch(Servers.Channel, channel_id),
         {:ok, server} <- fetch(Servers.Server, channel.server_id),
         true <-
           Permissions.has?(
             Permissions.effective_bits(actor, server, channel),
             :create_invite
           ) do
      changeset
      |> Ash.Changeset.force_change_attribute(:channel_id, channel.id)
      |> Ash.Changeset.force_change_attribute(:server_id, server.id)
      |> Ash.Changeset.force_change_attribute(:created_by_identity_id, actor.id)
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "missing_permission", message: "create_invite")
        )
    end
  end

  defp fetch(resource, id) do
    case id && Ash.get(resource, id, authorize?: false) do
      {:ok, record} -> {:ok, record}
      _ -> :error
    end
  end

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil
end
