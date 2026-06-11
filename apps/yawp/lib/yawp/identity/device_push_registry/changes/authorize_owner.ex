defmodule Yawp.Identity.DevicePushRegistry.Changes.AuthorizeOwner do
  @moduledoc false

  use Ash.Resource.Change

  alias Yawp.Identity.Identity
  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      identity_id = Ash.Changeset.get_attribute(changeset, :identity_id)

      if authorized?(changeset_actor(changeset), identity_id) do
        changeset
      else
        Ash.Changeset.add_error(changeset, RpcError.exception(type: "unauthorized"))
      end
    end)
  end

  defp changeset_actor(changeset) do
    changeset.context[:private][:actor] || Map.get(changeset.context, :actor)
  end

  defp authorized?(%Identity{id: id}, id), do: true
  defp authorized?(%{id: id}, id), do: true
  defp authorized?(nil, _), do: true
  defp authorized?(_, _), do: false
end
