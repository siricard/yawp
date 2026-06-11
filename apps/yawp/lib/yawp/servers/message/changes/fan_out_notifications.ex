defmodule Yawp.Servers.Message.Changes.FanOutNotifications do
  @moduledoc false

  use Ash.Resource.Change

  import Ecto.Query

  alias Yawp.Federation
  alias Yawp.Federation.Client
  alias Yawp.Federation.NotificationEnvelope
  alias Yawp.Identity
  alias Yawp.Servers.Channel
  alias Yawp.Servers.Membership

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, fn _changeset, message ->
      deliver(message)
      {:ok, message}
    end)
  end

  defp deliver(message) do
    with {:ok, channel} <- Ash.get(Channel, message.channel_id, authorize?: false) do
      channel.server_id
      |> recipients(message.sender_did)
      |> Enum.each(&maybe_deliver(&1, channel, message))
    end
  end

  defp recipients(server_id, sender_did) do
    query =
      from m in Membership,
        join: i in assoc(m, :identity),
        where:
          m.server_id == ^server_id and not m.banned and not m.kicked and i.did != ^sender_did,
        select: {i.id, i.did, i.anchor_list}

    Yawp.Repo.all(query)
  end

  defp maybe_deliver({identity_id, did, anchors}, channel, message) do
    case Identity.resolve_notification_level(%{
           identity_id: identity_id,
           server_id: channel.server_id,
           channel_id: channel.id
         }) do
      {:ok, :muted} ->
        :ok

      {:ok, :mentions_only} ->
        if mentioned?(did, message), do: deliver_to_anchors(did, anchors, channel, message)

      {:ok, :all} ->
        deliver_to_anchors(did, anchors, channel, message)

      _ ->
        :ok
    end
  end

  defp mentioned?(did, message) do
    did in List.wrap(message.mentions) or mentions_broadcast?(message.body)
  end

  defp mentions_broadcast?(body) when is_binary(body) do
    String.contains?(body, ["@here", "@everyone", "@role"])
  end

  defp mentions_broadcast?(_), do: false

  defp deliver_to_anchors(did, anchors, channel, message) do
    Enum.each(List.wrap(anchors), fn anchor ->
      with {:ok, envelope} <- build_envelope(did, anchor, channel, message) do
        push(anchor, did, envelope)
      end
    end)
  end

  defp build_envelope(did, _anchor, channel, message) do
    NotificationEnvelope.build(%{
      user_did: did,
      source: if(mentioned?(did, message), do: "room_mention", else: "room_message"),
      source_server: this_anchor_id(),
      room_id_or_thread_id: channel.id,
      message_id: message.id,
      timestamp: DateTime.to_iso8601(message.server_inserted_at)
    })
  end

  defp push(anchor, did, envelope) do
    if same_anchor?(anchor) do
      Federation.append_inbox(did, envelope, wrapper_signature: envelope["signature"])
    else
      Client.push_inbox!(anchor, envelope)
    end
  end

  defp same_anchor?(anchor), do: anchor == this_anchor_id()

  defp this_anchor_id do
    Application.get_env(:yawp, Client, [])
    |> Keyword.get_lazy(:anchor_id, fn ->
      url = Application.get_env(:yawp, YawpWeb.Endpoint, [])[:url] || []
      host = Keyword.get(url, :host, "localhost")
      port = Keyword.get(url, :port) || endpoint_port()
      if is_nil(port), do: host, else: "#{host}:#{port}"
    end)
  end

  defp endpoint_port do
    case Application.get_env(:yawp, YawpWeb.Endpoint, [])[:http] do
      nil -> nil
      http -> Keyword.get(http, :port)
    end
  end
end
