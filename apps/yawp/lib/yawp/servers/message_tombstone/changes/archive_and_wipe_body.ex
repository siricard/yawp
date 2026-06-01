defmodule Yawp.Servers.MessageTombstone.Changes.ArchiveAndWipeBody do
  @moduledoc """
  After the tombstone is persisted, archives the original body to the
  admin-only store when the server's `body_archive_enabled` flag is on,
  then wipes the message body in place. Runs inside the action's implicit
  transaction so archive + wipe + tombstone commit or roll back together.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, &archive_and_wipe/2)
  end

  defp archive_and_wipe(_changeset, tombstone) do
    case Ash.get(Yawp.Servers.Message, tombstone.message_id, authorize?: false) do
      {:ok, %{body: body} = message} when is_binary(body) ->
        maybe_archive(message, body)
        wipe(message)
        {:ok, tombstone}

      _ ->
        {:ok, tombstone}
    end
  end

  defp maybe_archive(message, body) do
    if body_archive_enabled?(message.channel_id) do
      Yawp.Servers.ArchivedMessageBody
      |> Ash.Changeset.for_create(:create, %{message_id: message.id, body: body})
      |> Ash.create!(authorize?: false)
    end
  end

  defp wipe(message) do
    message
    |> Ash.Changeset.for_update(:wipe_body, %{})
    |> Ash.update!(authorize?: false)
  end

  defp body_archive_enabled?(channel_id) do
    with {:ok, channel} <- Ash.get(Yawp.Servers.Channel, channel_id, authorize?: false),
         {:ok, server} <- Ash.get(Yawp.Servers.Server, channel.server_id, authorize?: false) do
      server.body_archive_enabled
    else
      _ -> false
    end
  end
end
