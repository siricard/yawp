defmodule Yawp.Servers.MessageEdit.Changes.AssignEditSerial do
  @moduledoc """
  Assigns the next per-message monotonic `edit_serial`, serialised by a
  transaction-scoped advisory lock keyed on the message.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &assign/1)
  end

  defp assign(%{valid?: false} = changeset), do: changeset

  defp assign(changeset) do
    message_id = Ash.Changeset.get_attribute(changeset, :message_id)

    lock_key = :erlang.phash2({:edit, message_id}, 2_147_483_647)
    Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [lock_key])

    %{rows: [[next]]} =
      Yawp.Repo.query!(
        "SELECT COALESCE(MAX(edit_serial), 0) + 1 FROM server_message_edits WHERE message_id = $1",
        [Ecto.UUID.dump!(message_id)]
      )

    Ash.Changeset.force_change_attribute(changeset, :edit_serial, next)
  end
end
