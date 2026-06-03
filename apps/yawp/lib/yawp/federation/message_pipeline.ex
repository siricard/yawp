defmodule Yawp.Federation.MessagePipeline do
  @moduledoc """
  Cross-cutting handling applied to inbound federation messages.

  Every inbound message piggybacks the sender's `sender_profile_version`.
  `maybe_refresh_ppe/2` compares it against the locally cached PPE: when
  the advertised version is newer (or we hold no cache), it enqueues a
  `Yawp.Federation.PpeRefreshWorker` job to refetch the sender's
  canonical PPE from one of their anchors. This is how a guest server
  keeps a sender's display name and avatar current without the sender's
  anchor having to push to every server the sender visits.
  """

  alias Yawp.Federation.PpeRefreshWorker
  alias Yawp.Identity

  @spec maybe_refresh_ppe(map(), keyword()) ::
          {:ok, :enqueued | :fresh | :no_anchors | :skipped} | {:error, term()}
  def maybe_refresh_ppe(message, _opts \\ []) when is_map(message) do
    with did when is_binary(did) <- Map.get(message, "sender_did", :missing),
         version when is_integer(version) <-
           Map.get(message, "sender_profile_version", :missing) do
      if newer_than_cache?(did, version) do
        enqueue_refresh(did, anchors_for(message, did))
      else
        {:ok, :fresh}
      end
    else
      _ -> {:ok, :skipped}
    end
  end

  defp newer_than_cache?(did, version) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{profile_version: current}} -> version > current
      _ -> true
    end
  end

  defp anchors_for(message, did) do
    cached =
      case Identity.get_ppe_by_did(did) do
        {:ok, %Identity.Ppe{envelope: %{"anchors" => anchors}}} when is_list(anchors) -> anchors
        _ -> []
      end

    message_anchors =
      case Map.get(message, "sender_anchors") do
        anchors when is_list(anchors) -> anchors
        _ -> []
      end

    (cached ++ message_anchors)
    |> Enum.filter(&is_binary/1)
    |> Enum.uniq()
  end

  defp enqueue_refresh(_did, []), do: {:ok, :no_anchors}

  defp enqueue_refresh(did, anchors) do
    %{"did" => did, "anchors" => anchors}
    |> PpeRefreshWorker.new()
    |> Oban.insert()
    |> case do
      {:ok, _job} -> {:ok, :enqueued}
      {:error, _} = err -> err
    end
  end
end
