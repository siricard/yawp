defmodule Yawp.Admin.ClaimToken.Changes.MintToken do
  @moduledoc """
  Generates a 128-bit random token (16 bytes → 26 char unpadded base32),
  sets a 15-minute TTL, stamps `created_by_account_id` from the action
  argument, and revokes any currently-active claim token so only one
  active token can exist at a time.
  """

  use Ash.Resource.Change

  require Ash.Query

  @ttl_seconds 15 * 60

  @impl true
  def change(changeset, _opts, _context) do
    account_id = Ash.Changeset.get_argument(changeset, :created_by_account_id)
    now = DateTime.utc_now()
    expires_at = DateTime.add(now, @ttl_seconds, :second)

    token =
      :crypto.strong_rand_bytes(16)
      |> Base.encode32(padding: false)

    changeset
    |> Ash.Changeset.force_change_attribute(:token, token)
    |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
    |> Ash.Changeset.force_change_attribute(:created_by_account_id, account_id)
    |> Ash.Changeset.before_action(&revoke_active_tokens/1)
  end

  defp revoke_active_tokens(changeset) do
    now = DateTime.utc_now()

    Yawp.Admin.ClaimToken
    |> Ash.Query.filter(is_nil(consumed_at) and is_nil(revoked_at) and expires_at > ^now)
    |> Ash.bulk_update!(:revoke, %{},
      authorize?: false,
      return_errors?: true,
      strategy: :stream
    )

    changeset
  end
end
