defmodule Yawp.Servers.Reorder do
  @moduledoc """
  Shared positioning logic for the channel and category `:reorder`
  generic actions. Verifies the actor holds `manage_channels` on the
  server, then writes positions `0..n-1` to the rows named in
  `ordered_ids`, in order.

  A `nil` actor is rejected with `not_authenticated` on any authorized
  call — only an explicit authorization bypass (`authorize?: false`,
  used by trusted server-side callers and tests) skips the gate.
  """

  alias Yawp.RpcError
  alias Yawp.Servers.Permissions

  @spec run(module(), map(), map()) :: {:ok, non_neg_integer()} | {:error, term()}
  def run(resource, %{server_id: server_id, ordered_ids: ordered_ids}, context) do
    with :ok <- authorize(server_id, context) do
      reposition(resource, server_id, ordered_ids)
    end
  end

  defp authorize(_server_id, %{authorize?: false}), do: :ok

  defp authorize(server_id, context) do
    case context_actor(context) do
      %Yawp.Identity.Identity{} = actor ->
        gate(server_id, actor)

      _ ->
        {:error, RpcError.exception(type: "not_authenticated", message: "not_authenticated")}
    end
  end

  defp gate(server_id, actor) do
    case Ash.get(Yawp.Servers.Server, server_id, authorize?: false) do
      {:ok, server} ->
        if Permissions.has?(Permissions.effective_bits(actor, server, nil), :manage_channels) do
          :ok
        else
          {:error, RpcError.exception(type: "missing_permission", message: "manage_channels")}
        end

      _ ->
        {:error, RpcError.exception(type: "missing_permission", message: "manage_channels")}
    end
  end

  defp reposition(resource, server_id, ordered_ids) do
    {:ok, {count, notifications}} =
      Yawp.Repo.transaction(fn ->
        notifications =
          ordered_ids
          |> Enum.with_index()
          |> Enum.flat_map(fn {id, position} ->
            {_record, n} =
              resource
              |> Ash.get!(id, authorize?: false)
              |> ensure_server!(server_id)
              |> Ash.Changeset.for_update(:reposition, %{position: position})
              |> Ash.update!(authorize?: false, return_notifications?: true)

            n
          end)

        {length(ordered_ids), notifications}
      end)

    Ash.Notifier.notify(notifications)
    {:ok, count}
  end

  defp ensure_server!(%{server_id: server_id} = record, server_id), do: record

  defp ensure_server!(_record, _server_id) do
    raise Ash.Error.Invalid.exception(
            errors: [
              RpcError.exception(type: "wrong_server", message: "row does not belong to server")
            ]
          )
  end

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil
end
