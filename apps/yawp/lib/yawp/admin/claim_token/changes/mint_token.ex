defmodule Yawp.Admin.ClaimToken.Changes.MintToken do
  @moduledoc """
  Generates a 128-bit random token (16 bytes → 26 char unpadded base32),
  sets a 15-minute TTL, stamps `created_by_account_id` from the action
  argument, and revokes any currently-active claim token so only one
  active token can exist at a time.

  ## production-safe concurrency

  The original wrapped Ash's inner transaction with an
  `around_transaction` callback that issued `pg_advisory_lock` via
  standalone `Repo.query!/2` calls. That works under the SQL sandbox
  (which pins every test process to one checked-out connection) but
  is unsound in production: the pool may hand the lock query and the
  inner `Repo.transaction/1` two different connections, leaving the
  revoke + insert running on a connection that does NOT hold the
  lock.

  The fix has three cooperating layers:

  1. **Action runs in a transaction.** `:generate` declares
     `transaction? true`, so Ash issues a single `Repo.transaction/1`
     that pins one connection for the whole action.
  2. **Transaction-scoped advisory lock on the same connection.** A
     `before_action` hook issues `pg_advisory_xact_lock(key)` from
     inside the transaction. Postgres acquires the lock on the
     pinned connection and auto-releases it on COMMIT or ROLLBACK
     no leaked locks, no cross-connection race.
  3. **Partial unique index on `((1))`.** Declared in the resource's
     `custom_indexes` block, this is the last line of defence: if
     two writers ever do get past the lock (e.g. someone disables
     the advisory lock in a future refactor), Postgres still rejects
     a second active row.

  Order matters in the change pipeline — the advisory lock MUST be
  acquired before `revoke_active_tokens/1` so concurrent mints
  serialise on the same key.
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
    |> Ash.Changeset.before_action(&acquire_xact_lock/1)
    |> Ash.Changeset.before_action(&revoke_active_tokens/1)
  end

                defp acquire_xact_lock(changeset) do
    Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [@advisory_lock_key])
    changeset
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
