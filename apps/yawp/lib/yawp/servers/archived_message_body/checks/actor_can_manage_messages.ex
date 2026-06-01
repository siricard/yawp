defmodule Yawp.Servers.ArchivedMessageBody.Checks.ActorCanManageMessages do
  @moduledoc """
  Authorises a read of an archived message body only for an identity that
  holds `manage_messages` on the owning server (server owners included,
  since `effective_bits` short-circuits them to the full mask).

  Reads must be scoped to a single message via the `message_id` argument;
  an unscoped or actorless read resolves to forbidden.
  """
  use Ash.Policy.SimpleCheck

  alias Yawp.Servers.Permissions

  @impl true
  def describe(_opts), do: "actor holds manage_messages on the message's server"

  @impl true
  def match?(%Yawp.Identity.Identity{} = actor, %{subject: %Ash.Query{} = query}, _opts) do
    case Ash.Query.get_argument(query, :message_id) do
      nil -> false
      message_id -> privileged?(actor, message_id)
    end
  end

  def match?(_, _, _), do: false

  defp privileged?(actor, message_id) do
    with {:ok, message} <- Ash.get(Yawp.Servers.Message, message_id, authorize?: false),
         {:ok, channel} <- Ash.get(Yawp.Servers.Channel, message.channel_id, authorize?: false),
         {:ok, server} <- Ash.get(Yawp.Servers.Server, channel.server_id, authorize?: false) do
      Permissions.has?(Permissions.effective_bits(actor, server, channel), :manage_messages)
    else
      _ -> false
    end
  end
end
