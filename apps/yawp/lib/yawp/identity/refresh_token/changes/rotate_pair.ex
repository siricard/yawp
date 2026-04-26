defmodule Yawp.Identity.RefreshToken.Changes.RotatePair do
  @moduledoc """
  wraps `Yawp.Identity.rotate_refresh/1`
  inside a generic create action so the call is exposed over
   RPC. The change short-circuits the create-pipeline:
  - On success, it sets the (already-persisted) successor refresh row
    as the action result and stashes the freshly-issued session+refresh
    token strings + expiry on action metadata.
  - On failure, it adds an `Yawp.RpcError` carrying a
    `refresh_rotated | refresh_revoked | refresh_expired | refresh_invalid`
    type so the client sees a stable slug.

  The action declares `manual` so the changeset is NOT submitted to the
  data layer — `rotate_refresh/1` owns the writes (in its own
  transaction with the necessary atomic update on the old refresh).
  """
  use Ash.Resource.ManualCreate

  alias Yawp.RpcError

  @impl true
  def create(changeset, _opts, _context) do
    token = Ash.Changeset.get_argument(changeset, :token)

    case Yawp.Identity.rotate_refresh(token) do
      {:ok, %{session_token: session, refresh_token: refresh}} ->
        result =
          refresh
          |> Ash.Resource.put_metadata(:session_token, session.token)
          |> Ash.Resource.put_metadata(:refresh_token, refresh.token)
          |> Ash.Resource.put_metadata(:expires_at, session.expires_at)

        {:ok, result}

      {:error, reason} ->
        slug = slug_for(reason)

        {:error,
         RpcError.exception(
           type: slug,
           message: slug
         )}
    end
  end

  defp slug_for(:rotated), do: "refresh_rotated"
  defp slug_for(:revoked), do: "refresh_revoked"
  defp slug_for(:expired), do: "refresh_expired"
  defp slug_for(:invalid), do: "refresh_invalid"
  defp slug_for(_), do: "refresh_invalid"
end
