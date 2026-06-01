defmodule Yawp.Servers.Message.Changes.AssignServerSerial do
  @moduledoc """
  Assigns the next per-channel monotonic `server_serial`.

  A transaction-scoped advisory lock keyed on the channel serialises
  concurrent sends to the same channel so two messages never claim the
  same serial; the lock auto-releases on commit/rollback. The serial is
  computed as `MAX(server_serial) + 1` over the channel and is unique by
  the `unique_channel_serial` identity.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &assign/1)
  end

  defp assign(%{valid?: false} = changeset), do: changeset

  defp assign(changeset) do
    channel_id = Ash.Changeset.get_attribute(changeset, :channel_id)

    lock_key = :erlang.phash2(channel_id, 2_147_483_647)
    Yawp.Repo.query!("SELECT pg_advisory_xact_lock($1)", [lock_key])

    %{rows: [[next]]} =
      Yawp.Repo.query!(
        "SELECT COALESCE(MAX(server_serial), 0) + 1 FROM server_messages WHERE channel_id = $1",
        [Ecto.UUID.dump!(channel_id)]
      )

    Ash.Changeset.force_change_attribute(changeset, :server_serial, next)
  end
end
