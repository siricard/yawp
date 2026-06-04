defmodule Yawp.Federation.InboxEntry.Changes.AssignInboxSerial do
  @moduledoc false
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &assign/1)
  end

  defp assign(%{valid?: false} = changeset), do: changeset

  defp assign(changeset) do
    recipient_did = Ash.Changeset.get_attribute(changeset, :recipient_did)
    envelope_id = Ash.Changeset.get_attribute(changeset, :envelope_id)

    lock_key = :erlang.phash2(recipient_did, 2_147_483_647)
    Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [lock_key])

    %{rows: [[existing]]} =
      Yawp.Repo.query!(
        "SELECT COUNT(*) FROM federation_inbox_entries WHERE recipient_did = $1 AND envelope_id = $2",
        [recipient_did, envelope_id]
      )

    %{rows: [[next]]} =
      Yawp.Repo.query!(
        "SELECT COALESCE(MAX(inbox_serial), 0) + 1 FROM federation_inbox_entries WHERE recipient_did = $1",
        [recipient_did]
      )

    changeset
    |> Ash.Changeset.force_change_attribute(:inbox_serial, next)
    |> Ash.Changeset.after_action(fn _changeset, entry ->
      {:ok, Ash.Resource.put_metadata(entry, :inbox_created?, existing == 0)}
    end)
  end
end
