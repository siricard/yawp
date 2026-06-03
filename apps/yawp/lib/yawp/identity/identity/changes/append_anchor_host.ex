defmodule Yawp.Identity.Identity.Changes.AppendAnchorHost do
  @moduledoc """
  Authorizes the actor against the target Identity row and appends a
  caller-supplied anchor host to `anchor_list`. Unlike
  `AppendAnchorUrl` (which trusts only the server's own URL during a
  bind), this change accepts the host the user is adopting as a second
  anchor — the user is the authority over their own anchor list.

  The actor MUST equal the Identity being modified. Failure →
  `Yawp.RpcError type: "unauthorized"`. Stashes `:anchor_appended?` on
  the context so `EnqueueAnchorAdoption` only enqueues when the host
  was newly added.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &authorize_and_append/1)
  end

  defp authorize_and_append(%{valid?: false} = changeset), do: changeset

  defp authorize_and_append(changeset) do
    actor = changeset.context[:private][:actor] || actor_from_context(changeset)

    cond do
      not is_struct(actor, Yawp.Identity.Identity) ->
        unauthorized(changeset)

      actor.id != changeset.data.id ->
        unauthorized(changeset)

      true ->
        append(changeset)
    end
  end

  defp append(changeset) do
    new_anchor = Ash.Changeset.get_argument(changeset, :new_anchor)
    anchors = Ash.Changeset.get_attribute(changeset, :anchor_list) || []

    if new_anchor in anchors do
      Ash.Changeset.put_context(changeset, :anchor_appended?, false)
    else
      current_version = Ash.Changeset.get_attribute(changeset, :profile_version) || 0

      changeset
      |> Ash.Changeset.force_change_attribute(:anchor_list, anchors ++ [new_anchor])
      |> Ash.Changeset.force_change_attribute(:profile_version, current_version + 1)
      |> Ash.Changeset.put_context(:anchor_appended?, true)
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
