defmodule Yawp.Servers.MessageTombstone.Changes.AuthorizeDelete do
  @moduledoc """
  Authorises a delete per ADR 019: the original sender may always delete
  their own message; anyone else needs the `manage_messages` bit on the
  message's server, resolved via `Yawp.Servers.Permissions`. A
  `:retention` tombstone is server-driven and bypasses this gate.
  """
  use Ash.Resource.Change

  alias Yawp.Servers.Permissions

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &authorize/1)
  end

  defp authorize(%{valid?: false} = changeset), do: changeset

  defp authorize(changeset) do
    reason = Ash.Changeset.get_attribute(changeset, :reason)
    actor = changeset.context[:actor_identity]
    message = changeset.context[:target_message]

    cond do
      reason == :retention ->
        changeset

      sender?(actor, message) ->
        changeset

      manage_messages?(actor, message) ->
        changeset

      true ->
        Ash.Changeset.add_error(changeset, field: :actor_did, message: "manage_messages")
    end
  end

  defp sender?(%{did: did}, %{sender_did: sender_did}), do: did == sender_did
  defp sender?(_, _), do: false

  defp manage_messages?(%Yawp.Identity.Identity{} = actor, message) do
    with {:ok, channel} <- Ash.get(Yawp.Servers.Channel, message.channel_id, authorize?: false),
         {:ok, server} <- Ash.get(Yawp.Servers.Server, channel.server_id, authorize?: false) do
      Permissions.has?(Permissions.effective_bits(actor, server, channel), :manage_messages)
    else
      _ -> false
    end
  end

  defp manage_messages?(_, _), do: false
end
