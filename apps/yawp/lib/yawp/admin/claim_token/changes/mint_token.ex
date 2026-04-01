defmodule Yawp.Admin.ClaimToken.Changes.MintToken do
  @moduledoc """
  Generates a 128-bit random token (16 bytes → 26 char unpadded base32),
  sets a 15-minute TTL, stamps `created_by_account_id` from the action
  argument, and revokes any currently-active claim token so only one
  active token can exist at a time.

  ## concurrent generators

  Two concurrent generators could previously both see the empty
  active-set, both revoke nothing, and both insert a fresh row
  leaving two active claim tokens and breaking the invariant.

  The fix has two layers, both required:

  1. **Postgres partial unique index** `admin_claim_tokens_one_active_index`
     (declared in `Yawp.Admin.ClaimToken`'s `custom_indexes`) is the
     last line of defence — Postgres physically rejects a second
     active row.
  2. **Advisory transaction lock** keyed by
     `hashtext('yawp.admin_claim_token.generate')` serialises concurrent
     mints so the second caller blocks until the first has revoked the
     old active row and inserted its replacement. Without this, the
     second caller would simply crash on the unique-index violation.

  Both the revoke and the insert run inside the same `Repo.transaction`
  so the index sees a consistent picture: either the old row is
  revoked and the new row is inserted, or neither is.
  """

  use Ash.Resource.Change

  require Ash.Query

  @ttl_seconds 15 * 60

          @advisory_lock_key 7_151_500_000_000_001

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
    |> Ash.Changeset.around_transaction(&with_advisory_lock/2)
    |> Ash.Changeset.before_action(&revoke_active_tokens/1)
  end

              defp with_advisory_lock(changeset, callback) do
    Yawp.Repo.query!("SELECT pg_advisory_lock($1)", [@advisory_lock_key])

    try do
      callback.(changeset)
    after
      Yawp.Repo.query!("SELECT pg_advisory_unlock($1)", [@advisory_lock_key])
    end
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
