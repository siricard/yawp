defmodule Yawp.Identity.NotificationPreference.Changes.ResolveIdentity do
  @moduledoc false

  use Ash.Resource.Change

  alias Yawp.Identity

  @impl true
  def change(changeset, _opts, _context) do
    case Ash.Changeset.get_argument(changeset, :identity_id) do
      id when is_binary(id) ->
        Ash.Changeset.force_change_attribute(changeset, :identity_id, id)

      _ ->
        resolve_did(changeset)
    end
  end

  defp resolve_did(changeset) do
    case Ash.Changeset.get_argument(changeset, :identity_did) do
      did when is_binary(did) ->
        case Identity.get_identity_by_did(did) do
          {:ok, identity} ->
            Ash.Changeset.force_change_attribute(changeset, :identity_id, identity.id)

          _ ->
            changeset
        end

      _ ->
        changeset
    end
  end
end
