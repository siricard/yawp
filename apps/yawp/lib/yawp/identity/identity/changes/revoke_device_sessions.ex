defmodule Yawp.Identity.Identity.Changes.RevokeDeviceSessions do
  @moduledoc """
  authorizes the actor against the
  target Identity row and, on success, calls
  `Yawp.Identity.revoke_all_for_device/2`.

  The actor MUST equal the Identity being revoked. Failure →
  `Yawp.RpcError type: "unauthorized"`.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &authorize_and_revoke/1)
  end

  defp authorize_and_revoke(%{valid?: false} = changeset), do: changeset

  defp authorize_and_revoke(changeset) do
    actor = changeset.context[:private][:actor] || actor_from_context(changeset)

    cond do
      actor == nil ->
        unauthorized(changeset)

      not is_struct(actor, Yawp.Identity.Identity) ->
        unauthorized(changeset)

      actor.id != changeset.data.id ->
        unauthorized(changeset)

      true ->
        device_id = Ash.Changeset.get_argument(changeset, :device_id)
        :ok = Yawp.Identity.revoke_all_for_device(changeset.data.id, device_id)
        changeset
    end
  end

  defp actor_from_context(changeset) do
    case changeset.context do
      %{actor: actor} -> actor
      _ -> nil
    end
  end

  defp unauthorized(changeset) do
    Ash.Changeset.add_error(
      changeset,
      RpcError.exception(type: "unauthorized", message: "unauthorized")
    )
  end
end
