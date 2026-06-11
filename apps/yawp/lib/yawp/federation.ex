defmodule Yawp.Federation do
  @moduledoc false

  use Ash.Domain, otp_app: :yawp

  alias Yawp.Federation.AnchorHost
  alias Yawp.Federation.Client
  alias Yawp.Federation.DeviceSignature
  alias Yawp.Federation.DeliveryState
  alias Yawp.Federation.InboxEntry
  alias Yawp.Identity

  require Ash.Query

  resources do
    resource Yawp.Federation.ServerKey do
      define :generate_server_key, action: :generate, args: []
      define :get_active_server_key, action: :get_active, not_found_error?: false
      define :list_published_server_keys, action: :list_published
      define :revoke_server_key, action: :revoke
    end

    resource Yawp.Federation.InboxEntry do
      define :append_inbox_entry, action: :append
      define :pull_inbox_entries, action: :pull
    end

    resource Yawp.Federation.DeliveryState do
      define :upsert_delivery_state, action: :upsert
      define :delivery_states_for_envelope, action: :for_envelope, args: [:envelope_id]
      define :delivery_states_for_conversation, action: :for_conversation, args: [:envelope_ids]
    end

    resource Yawp.Federation.DmReadMarker do
      define :upsert_dm_read_marker, action: :upsert

      define :get_dm_read_marker,
        action: :get_for_identity_conversation,
        args: [:identity_id, :conversation_id],
        not_found_error?: false
    end
  end

  @spec append_inbox(String.t(), map()) ::
          {:ok, InboxEntry.t()} | {:error, term()}
  def append_inbox(recipient_did, envelope, opts \\ [])
      when is_binary(recipient_did) and is_map(envelope) do
    result =
      append_inbox_entry(%{
        identity_id: recipient_did,
        recipient_did: recipient_did,
        envelope_id: Map.fetch!(envelope, "envelope_id"),
        conversation_id: Map.get(envelope, "conversation_id"),
        kind: Map.get(envelope, "kind", "dm"),
        ciphertext_envelope: envelope,
        envelope: envelope,
        wrapper_signature: Keyword.get(opts, :wrapper_signature),
        is_request: message_request?(recipient_did, envelope),
        received_at: Keyword.get_lazy(opts, :received_at, &DateTime.utc_now/0)
      })

    with {:ok, %{__metadata__: %{inbox_created?: true}} = entry} <- result do
      bare = String.replace_prefix(recipient_did, "did:yawp:", "")

      Phoenix.PubSub.broadcast(
        Yawp.PubSub,
        YawpWeb.UserChannel.inbox_topic(bare),
        {:inbox, entry}
      )
    end

    result
  end

  @spec submit_dm(map()) :: {:ok, map()} | {:error, term()}
  def submit_dm(envelope) when is_map(envelope) do
    with :ok <- DeviceSignature.verify(envelope),
         :ok <- sender_anchored_here(envelope),
         :ok <- mark_sent(envelope),
         {:ok, deliveries} <- deliver_dm(envelope) do
      {:ok, %{deliveries: deliveries}}
    end
  end

  def submit_dm(_), do: {:error, :invalid_envelope}

  @spec local_anchor_host() :: String.t()
  def local_anchor_host do
    Application.get_env(:yawp, Client, [])
    |> Keyword.get_lazy(:anchor_id, &endpoint_host/0)
    |> AnchorHost.normalize()
  end

  @spec pull_inbox(String.t(), integer(), integer()) ::
          {:ok, [Yawp.Federation.InboxEntry.t()]} | {:error, term()}
  def pull_inbox(recipient_did, since_serial \\ 0, limit \\ 1000)
      when is_binary(recipient_did) do
    pull_inbox_entries(%{
      recipient_did: recipient_did,
      since_serial: since_serial,
      limit: limit
    })
  end

  @spec ensure_active_server_key!() :: :ok
  def ensure_active_server_key! do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{}} ->
        :ok

      {:ok, nil} ->
        {:ok, key} = generate_server_key()
        require Logger
        Logger.info("Generated federation server key #{key.key_id}")
        :ok
    end
  end

  @spec sign(term(), keyword()) :: {:ok, binary(), String.t()} | {:error, :no_active_key}
  def sign(payload, _opts \\ []) do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{} = key} ->
        canonical = Yawp.CanonicalJson.encode(payload)
        signature = :crypto.sign(:eddsa, :none, canonical, [key.private_key, :ed25519])
        {:ok, signature, key.key_id}

      {:ok, nil} ->
        {:error, :no_active_key}
    end
  end

  defp deliver_dm(envelope) do
    recipient_dids = Map.get(envelope, "recipient_dids")

    cond do
      is_list(recipient_dids) and recipient_dids != [] and Enum.all?(recipient_dids, &is_binary/1) ->
        recipient_dids
        |> recipient_anchor_targets()
        |> deliver_targets(envelope)

      is_binary(Map.get(envelope, "recipient_did")) ->
        [Map.fetch!(envelope, "recipient_did")]
        |> recipient_anchor_targets()
        |> deliver_targets(envelope)

      true ->
        {:error, :invalid_envelope}
    end
  end

  defp recipient_anchor_targets(recipient_dids) do
    recipient_dids
    |> Enum.flat_map(fn did ->
      did
      |> anchors_for_recipient()
      |> Enum.map(&{&1, did})
    end)
    |> Enum.group_by(fn {anchor, _did} -> anchor end, fn {_anchor, did} -> did end)
    |> Enum.into(%{}, fn {anchor, dids} -> {anchor, Enum.uniq(dids)} end)
  end

  defp deliver_targets(targets, envelope) do
    local = local_anchor_host()

    if map_size(targets) == 0 do
      {:error, :unresolvable_recipient}
    else
      targets
      |> Enum.reduce_while({:ok, []}, fn {anchor, dids}, {:ok, acc} ->
        result =
          if AnchorHost.normalize(anchor) == local do
            deliver_local(dids, envelope)
          else
            deliver_remote(anchor, envelope)
          end

        case result do
          :ok -> {:cont, {:ok, [%{anchor: anchor, recipients: dids} | acc]}}
          {:error, reason} -> {:halt, {:error, reason}}
        end
      end)
      |> case do
        {:ok, deliveries} -> {:ok, Enum.reverse(deliveries)}
        error -> error
      end
    end
  end

  defp deliver_local(dids, envelope) do
    Enum.reduce_while(dids, :ok, fn did, _acc ->
      case append_inbox(did, envelope) do
        {:ok, _} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp deliver_remote(anchor, envelope) do
    case Client.push_inbox!(anchor, envelope) do
      {:ok, %{"delivery_acks" => acks}} when is_list(acks) ->
        Enum.each(acks, &apply_delivery_ack/1)
        :ok

      {:ok, _} ->
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec apply_delivery_ack(map()) :: :ok | {:error, term()}
  def apply_delivery_ack(%{
        "envelope_id" => envelope_id,
        "recipient_did" => recipient_did
      }) do
    with {:ok, _state} <- delivery_state_for(envelope_id, recipient_did),
         {:ok, _} <-
           upsert_delivery_state(%{
             envelope_id: envelope_id,
             recipient_did: recipient_did,
             state: :delivered,
             updated_at: DateTime.utc_now()
           }) do
      publish_delivery_state(envelope_id, recipient_did, :delivered)
      :ok
    else
      {:error, :not_found} -> {:error, :unknown_delivery_state}
      {:error, _} = error -> error
    end
  end

  def apply_delivery_ack(_), do: {:error, :invalid_delivery_ack}

  @spec apply_read_marker(map()) :: :ok | {:error, term()}
  def apply_read_marker(%{
        "recipient_did" => recipient_did,
        "last_read_envelope_id" => envelope_id
      }) do
    with {:ok, _state} <- delivery_state_for(envelope_id, recipient_did),
         {:ok, _} <-
           upsert_delivery_state(%{
             envelope_id: envelope_id,
             recipient_did: recipient_did,
             state: :read,
             updated_at: DateTime.utc_now()
           }) do
      publish_delivery_state(envelope_id, recipient_did, :read)
      :ok
    else
      {:error, :not_found} -> {:error, :unknown_delivery_state}
      {:error, _} = error -> error
    end
  end

  def apply_read_marker(_), do: {:error, :invalid_read_marker}

  @spec delivery_summary([DeliveryState.t()], [String.t()]) :: map()
  def delivery_summary(states, recipient_dids) when is_list(states) and is_list(recipient_dids) do
    recipients = Enum.uniq(recipient_dids)
    total = length(recipients)

    delivered =
      states
      |> Enum.filter(&(&1.recipient_did in recipients and &1.state in [:delivered, :read]))
      |> Enum.map(& &1.recipient_did)
      |> Enum.uniq()
      |> length()

    read =
      states
      |> Enum.filter(&(&1.recipient_did in recipients and &1.state == :read))
      |> Enum.map(& &1.recipient_did)
      |> Enum.uniq()
      |> length()

    %{delivered: delivered, read: read, total: total}
  end

  defp mark_sent(%{"envelope_id" => envelope_id, "sender_did" => sender_did} = envelope)
       when is_binary(envelope_id) and is_binary(sender_did) do
    :persistent_term.put({__MODULE__, :envelope_sender, envelope_id}, sender_did)
    mark_sent(Map.delete(envelope, "sender_did"))
  end

  defp mark_sent(%{"envelope_id" => envelope_id, "recipient_dids" => dids})
       when is_binary(envelope_id) and is_list(dids) do
    dids
    |> Enum.filter(&is_binary/1)
    |> Enum.reduce_while(:ok, fn did, :ok ->
      case upsert_delivery_state(%{
             envelope_id: envelope_id,
             recipient_did: did,
             state: :sent,
             updated_at: DateTime.utc_now()
           }) do
        {:ok, _} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp mark_sent(%{"envelope_id" => envelope_id, "recipient_did" => did})
       when is_binary(envelope_id) and is_binary(did) do
    upsert_delivery_state(%{
      envelope_id: envelope_id,
      recipient_did: did,
      state: :sent,
      updated_at: DateTime.utc_now()
    })
    |> state_result()
  end

  defp mark_sent(_), do: {:error, :invalid_envelope}

  defp state_result({:ok, _}), do: :ok
  defp state_result({:error, _} = error), do: error

  defp delivery_state_for(envelope_id, recipient_did) do
    with {:ok, states} <- delivery_states_for_envelope(envelope_id),
         %DeliveryState{} = state <- Enum.find(states, &(&1.recipient_did == recipient_did)) do
      {:ok, state}
    else
      nil -> {:error, :not_found}
      error -> error
    end
  end

  defp publish_delivery_state(envelope_id, recipient_did, state) do
    topic =
      YawpWeb.UserChannel.inbox_topic(bare_did(sender_did_for_envelope(envelope_id)))

    Phoenix.PubSub.broadcast(Yawp.PubSub, topic, {
      :delivery_state,
      %{
        envelope_id: envelope_id,
        recipient_did: recipient_did,
        state: Atom.to_string(state)
      }
    })
  end

  defp sender_did_for_envelope(envelope_id) do
    case :persistent_term.get({__MODULE__, :envelope_sender, envelope_id}, nil) do
      did when is_binary(did) ->
        did

      _ ->
        pull_sender_from_inbox(envelope_id)
    end
    |> case do
      did when is_binary(did) -> did
      _ -> nil
    end
  end

  defp pull_sender_from_inbox(envelope_id) do
    env_id = envelope_id

    Yawp.Federation.InboxEntry
    |> Ash.Query.filter(envelope_id == ^env_id)
    |> Ash.read_one(authorize?: false)
    |> case do
      {:ok, %Yawp.Federation.InboxEntry{envelope: %{"sender_did" => did}}} -> did
      _ -> nil
    end
  end

  defp bare_did("did:yawp:" <> bare), do: bare
  defp bare_did(did) when is_binary(did), do: did
  defp bare_did(_), do: ""

  defp anchors_for_recipient(did) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{envelope: %{"anchors" => anchors}}} when is_list(anchors) ->
        normalize_anchor_hosts(anchors)

      _ ->
        local_identity_anchors(did)
    end
  end

  # A locally bound identity records its anchors on the Identity row's
  # `anchor_list` before (or without) a published PPE. Fall back to that
  # list so a freshly bound sender/recipient still resolves to its anchors.
  defp local_identity_anchors(did) do
    case Identity.get_identity_by_did(did) do
      {:ok, %Identity.Identity{anchor_list: anchors}} when is_list(anchors) ->
        normalize_anchor_hosts(anchors)

      _ ->
        []
    end
  end

  defp normalize_anchor_hosts(anchors) do
    anchors
    |> Enum.filter(&(is_binary(&1) and &1 != ""))
    |> Enum.map(&AnchorHost.normalize/1)
    |> Enum.uniq()
  end

  defp sender_anchored_here(%{"sender_did" => sender_did}) when is_binary(sender_did) do
    case anchors_for_recipient(sender_did) do
      anchors when is_list(anchors) ->
        if local_anchor_host() in anchors, do: :ok, else: {:error, :sender_not_anchored_here}

      _ ->
        {:error, :sender_not_anchored_here}
    end
  end

  defp sender_anchored_here(_), do: {:error, :invalid_envelope}

  defp message_request?(recipient_did, %{"kind" => kind}) when kind != "dm" do
    message_request?(recipient_did, %{})
  end

  defp message_request?(recipient_did, %{"sender_did" => sender_did})
       when is_binary(recipient_did) and is_binary(sender_did) do
    not shared_server?(recipient_did, sender_did) and
      sender_did not in accepted_peers(recipient_did)
  end

  defp message_request?(_, _), do: false

  defp shared_server?(left_did, right_did) do
    %{rows: [[count]]} =
      Yawp.Repo.query!(
        """
        SELECT COUNT(*)
        FROM server_memberships left_membership
        JOIN identities left_identity ON left_identity.id = left_membership.identity_id
        JOIN server_memberships right_membership ON right_membership.server_id = left_membership.server_id
        JOIN identities right_identity ON right_identity.id = right_membership.identity_id
        WHERE left_identity.did = $1 AND right_identity.did = $2
          AND left_membership.banned = false AND left_membership.kicked = false
          AND right_membership.banned = false AND right_membership.kicked = false
        """,
        [left_did, right_did]
      )

    count > 0
  end

  defp accepted_peers(did) do
    case Identity.get_private_blob_by_did(did) do
      {:ok, %Identity.PrivateBlob{ciphertext: ciphertext}} -> decode_accepted_peers(ciphertext)
      _ -> []
    end
  end

  defp decode_accepted_peers(ciphertext) when is_binary(ciphertext) do
    with {:ok, blob} <- Jason.decode(ciphertext),
         peers when is_list(peers) <- Map.get(blob, "accepted_peers", []) do
      Enum.filter(peers, &is_binary/1)
    else
      _ -> []
    end
  end

  defp decode_accepted_peers(_), do: []

  defp endpoint_host do
    url = Application.get_env(:yawp, YawpWeb.Endpoint, [])[:url] || []
    host = Keyword.get(url, :host, "localhost")

    case Keyword.get(url, :port) || endpoint_http_port() do
      nil -> host
      port -> "#{host}:#{port}"
    end
  end

  defp endpoint_http_port do
    case Application.get_env(:yawp, YawpWeb.Endpoint, [])[:http] do
      nil -> nil
      http -> Keyword.get(http, :port)
    end
  end
end
