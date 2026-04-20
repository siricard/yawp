defmodule Yawp.Identity.Identity.Changes.IssueSessionPair do
  @moduledoc """
  `after_action` change that issues a session+refresh pair
  for the freshly bound `(identity_id, device_id)` and stashes the
  token strings + expiry on the result's action metadata
  (`:session_token`, `:refresh_token`, `:expires_at`). The RPC layer
  surfaces these via `show_metadata`.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, &issue/2)
  end

  defp issue(changeset, identity) do
    device_id = Ash.Changeset.get_argument(changeset, :device_id)

    case Yawp.Identity.issue_pair(identity.id, device_id) do
      {:ok, %{session_token: session, refresh_token: refresh}} ->
        identity_with_meta =
          identity
          |> Ash.Resource.put_metadata(:session_token, session.token)
          |> Ash.Resource.put_metadata(:refresh_token, refresh.token)
          |> Ash.Resource.put_metadata(:expires_at, session.expires_at)

        {:ok, identity_with_meta}

      {:error, err} ->
        {:error, err}
    end
  end
end
