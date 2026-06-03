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

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"did" => did, "anchors" => anchors}})
      when is_binary(did) and is_list(anchors) do
    Enum.reduce_while(anchors, {:error, :no_anchor_reachable}, fn anchor, _acc ->
      case fetch_and_apply(anchor, did) do
        :ok -> {:halt, :ok}
        {:error, _} -> {:cont, {:error, :no_anchor_reachable}}
      end
    end)
  end

  defp fetch_and_apply(anchor, did) do
    with {:ok, envelope} <- Client.fetch_ppe!(anchor, did),
         {:ok, _status} <- Identity.apply_ppe_if_newer(envelope) do
      :ok
    end
  end
end
