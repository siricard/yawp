defmodule Yawp.Servers.Changes.ResolveModerationTarget do
  @moduledoc """
  Resolves the moderation target for the `Kick` / `Ban` create actions.

  Callers may identify the target either by `identity_id` (preferred,
  used server-side) or by `did` (used by clients that only hold the
  target's DID). When `identity_id` is absent but `did` is present, this
  change looks up the matching `Yawp.Identity.Identity` and fills in the
  `identity_id` argument. Runs before the permission gate so downstream
  changes always see a resolved `identity_id`.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    identity_id = Ash.Changeset.get_argument(changeset, :identity_id)
    did = Ash.Changeset.get_argument(changeset, :did)

    cond do
      not is_nil(identity_id) ->
        changeset

      is_binary(did) ->
        resolve(changeset, did)

      true ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "invalid_payload", message: "identity_id or did required")
        )
    end
  end

  defp resolve(changeset, did) do
    case Yawp.Identity.get_identity_by_did(did) do
      {:ok, %Yawp.Identity.Identity{id: id}} ->
        Ash.Changeset.set_argument(changeset, :identity_id, id)

      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "identity_not_found", message: "identity_not_found")
        )
    end
  end
end
