defmodule Yawp.Identity.RefreshToken.Changes.MintTokenPair do
  @moduledoc """
  mints a refresh-token row, then in an `after_action`
  inserts the paired session-token row. Both inserts run inside the
  enclosing action's implicit transaction, so failure rolls back the
  full pair.

  The paired session row is returned via the `:paired_session_token`
  action metadata.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    token =
      :crypto.strong_rand_bytes(16)
      |> Base.url_encode64(padding: false)

    expires_at =
      DateTime.utc_now()
      |> DateTime.add(Yawp.Identity.RefreshToken.ttl_seconds(), :second)

    changeset
    |> Ash.Changeset.force_change_attribute(:token, token)
    |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
    |> Ash.Changeset.after_action(&mint_session/2)
  end

  defp mint_session(_changeset, refresh) do
    identity_id = refresh.identity_id
    device_id = refresh.device_id

    case Yawp.Identity.SessionToken
         |> Ash.Changeset.for_create(:issue, %{
           identity_id: identity_id,
           device_id: device_id
         })
         |> Ash.create(authorize?: false) do
      {:ok, session} ->
        {:ok, Ash.Resource.put_metadata(refresh, :paired_session_token, session)}

      {:error, err} ->
        {:error, err}
    end
  end
end
