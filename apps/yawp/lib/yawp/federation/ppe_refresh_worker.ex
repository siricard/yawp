defmodule Yawp.Federation.PpeRefreshWorker do
  @moduledoc """
  Background fetch of a sender's canonical Public Profile Envelope.

  Enqueued by `Yawp.Federation.MessagePipeline.maybe_refresh_ppe/2`
  when an inbound message advertises a `sender_profile_version` newer
  than what we hold. The worker tries each of the sender's anchors in
  turn until one returns a usable envelope, then applies it to the
  local cache (apply-if-newer enforces the version rule again).
  """

  use Oban.Worker, queue: :default, max_attempts: 3

  alias Yawp.Federation.Client
  alias Yawp.Identity
  alias YawpWeb.UserChannel

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"did" => did, "anchors" => anchors} = args})
      when is_binary(did) and is_list(anchors) do
    recipients = Map.get(args, "recipient_dids", [])

    Enum.reduce_while(anchors, {:error, :no_anchor_reachable}, fn anchor, _acc ->
      case fetch_and_apply(anchor, did, recipients) do
        :ok -> {:halt, :ok}
        {:error, _} -> {:cont, {:error, :no_anchor_reachable}}
      end
    end)
  end

  defp fetch_and_apply(anchor, did, recipients) do
    with {:ok, envelope} <- Client.fetch_ppe!(anchor, did),
         {:ok, _status} <- Identity.apply_ppe_if_newer(envelope) do
      notify_peer_key_refreshed(did, envelope, recipients)
      :ok
    end
  end

  defp notify_peer_key_refreshed(did, %{"public_key" => pk}, recipients) when is_binary(pk) do
    recipients
    |> Enum.filter(&is_binary/1)
    |> Enum.uniq()
    |> Enum.each(fn recipient ->
      Phoenix.PubSub.broadcast(
        Yawp.PubSub,
        UserChannel.inbox_topic(String.replace_prefix(recipient, "did:yawp:", "")),
        {:peer_key_refreshed, %{sender_did: did, sender_public_key: pk}}
      )
    end)
  end

  defp notify_peer_key_refreshed(_did, _envelope, _recipients), do: :ok
end
