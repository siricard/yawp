defmodule Yawp.Federation.InboxEntry.Changes.AssignInboxSerial do
  @moduledoc """
  Assigns the next per-recipient monotonic `inbox_serial`.

  A transaction-scoped advisory lock keyed on the recipient DID
  serialises concurrent appends to the same inbox so two envelopes
  never claim the same serial; the lock auto-releases on
  commit/rollback. On a repeat `envelope_id` the upsert leaves the
  existing row untouched, so the recomputed serial is discarded.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &assign/1)
  end

  defp assign(%{valid?: false} = changeset), do: changeset

  defp assign(changeset) do
    recipient_did = Ash.Changeset.get_attribute(changeset, :recipient_did)

    lock_key = :erlang.phash2(recipient_did, 2_147_483_647)
    Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [lock_key])

    %{rows: [[next]]} =
      Yawp.Repo.query!(
        "SELECT COALESCE(MAX(inbox_serial), 0) + 1 FROM federation_inbox_entries WHERE recipient_did = $1",
        [recipient_did]
      )

    Ash.Changeset.force_change_attribute(changeset, :inbox_serial, next)
  end
end
