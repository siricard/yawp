defmodule YawpWeb.FederationController do
  @moduledoc false

  use YawpWeb, :controller

  alias Yawp.Federation
  alias Yawp.Federation.AnchorHost
  alias Yawp.Federation.DeliveryBudget
  alias Yawp.Federation.DeviceSignature
  alias Yawp.Federation.InnerSignature
  alias Yawp.Federation.MessagePipeline
  alias Yawp.Federation.NotificationSignature
  alias Yawp.Federation.PresenceBroker
  alias Yawp.Federation.RemotePresence
  alias Yawp.Federation.Wrapper
  alias Yawp.Identity

  def ppe_push(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with :ok <- InnerSignature.verify(inner, "did", "signature"),
           {:ok, status} <- Identity.apply_ppe_if_newer(inner) do
        ok(conn, %{"status" => status})
      else
        {:error, :invalid_inner_signature} -> error(conn, 403, "invalid_inner_signature")
        {:error, _} -> error(conn, 422, "invalid_ppe")
      end
    end)
  end

  def blob_push(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with %{"did" => did, "ciphertext" => ct_b64, "blob_version" => version}
           when is_binary(did) and is_binary(ct_b64) and is_integer(version) <- inner,
           :ok <- InnerSignature.verify(inner, "did", "signature"),
           {:ok, ciphertext} <- Base.decode64(ct_b64),
           {:ok, status} <-
             Identity.apply_blob_if_newer(did, ciphertext, version,
               public_key: Map.get(inner, "public_key"),
               signature: Map.get(inner, "signature")
             ) do
        ok(conn, %{"status" => status})
      else
        {:error, :invalid_inner_signature} -> error(conn, 403, "invalid_inner_signature")
        _ -> error(conn, 422, "invalid_blob")
      end
    end)
  end

  def inbox_push(conn, params) do
    with_inner(conn, params, fn inner, anchor ->
      with :ok <- validate_envelope_recipients(inner),
           :ok <- consume_delivery_budget(anchor),
           :ok <- verify_inbox_envelope(inner, anchor),
           {:ok, _} <- MessagePipeline.maybe_refresh_ppe(inner),
           {:ok, acks} <- append_envelope(inner),
           :ok <- DeliveryBudget.record_accepted(anchor),
           :ok <- push_delivery_acks(anchor, acks) do
        ok(conn, %{"status" => "appended"})
      else
        {:error, {:rate_limited, retry_after}} -> rate_limited(conn, anchor, retry_after)
        {:error, :invalid_inner_signature} -> error(conn, 403, "invalid_inner_signature")
        {:error, :unresolvable_sender} -> error(conn, 422, "unresolvable_sender")
        _ -> error(conn, 422, "invalid_envelope")
      end
    end)
  end

  def inbox_ack(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      case Federation.apply_delivery_ack(inner) do
        :ok -> ok(conn, %{"status" => "delivered"})
        {:error, _} -> error(conn, 422, "invalid_delivery_ack")
      end
    end)
  end

  def inbox_read_marker(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with :ok <- outbound_read_receipts_enabled(inner),
           :ok <- Federation.apply_read_marker(inner) do
        ok(conn, %{"status" => "read"})
      else
        {:error, :read_receipts_disabled} -> ok(conn, %{"status" => "dropped"})
        _ -> error(conn, 422, "invalid_read_marker")
      end
    end)
  end

  def adopt(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      case Identity.adopt_identity(inner) do
        {:ok, :adopted} -> ok(conn, %{"status" => "adopted"})
        {:error, _} -> error(conn, 422, "invalid_adoption")
      end
    end)
  end

  def devices_changed(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with %{"did" => did, "device_subkeys" => subkeys}
           when is_binary(did) and is_map(subkeys) <- inner,
           :ok <- InnerSignature.verify(inner, "did", "signature"),
           {:ok, _identity} <-
             Identity.apply_device_subkey_change(did, subkeys, Map.get(inner, "profile_version")) do
        ok(conn, %{"status" => "applied"})
      else
        {:error, :invalid_inner_signature} -> error(conn, 403, "invalid_inner_signature")
        {:error, :not_found} -> error(conn, 404, "unknown_identity")
        _ -> error(conn, 422, "invalid_device_change")
      end
    end)
  end

  def presence_subscribe(conn, params) do
    with_inner(conn, params, fn inner, anchor ->
      with %{"did" => did} when is_binary(did) and did != "" <- inner,
           true <- is_binary(anchor) and anchor != "",
           :ok <- authorize_presence_subscribe(did, anchor) do
        :ok = PresenceBroker.subscribe(did, anchor)
        ok(conn, %{"status" => "subscribed"})
      else
        {:error, :unauthorized_presence} -> error(conn, 403, "unauthorized_presence")
        _ -> error(conn, 422, "invalid_subscribe")
      end
    end)
  end

  def presence_notify(conn, params) do
    with_inner(conn, params, fn inner, anchor ->
      with %{"did" => did, "state" => state}
           when is_binary(did) and state in ["online", "idle", "offline"] <- inner,
           :ok <- authorize_presence_notify(did, anchor) do
        :ok = RemotePresence.apply(did, state)
        ok(conn, %{"status" => "noted"})
      else
        {:error, :unauthorized_presence} -> error(conn, 403, "unauthorized_presence")
        _ -> error(conn, 422, "invalid_notify")
      end
    end)
  end

  def ppe_fetch(conn, %{"did" => did}) when is_binary(did) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{envelope: envelope}} when is_map(envelope) ->
        ok(conn, %{"ppe" => envelope})

      _ ->
        error(conn, 404, "unknown_ppe")
    end
  end

  def pull(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with %{"recipient_did" => did} when is_binary(did) <- inner,
           {:ok, entries} <-
             Federation.pull_inbox(
               did,
               int_arg(inner, "since_serial", 0),
               int_arg(inner, "limit", 1000)
             ) do
        ok(conn, %{"envelopes" => Enum.map(entries, &serialize_entry/1)})
      else
        _ -> error(conn, 422, "invalid_pull_request")
      end
    end)
  end

  defp validate_envelope_recipients(%{"envelope_id" => env_id} = envelope)
       when is_binary(env_id) do
    cond do
      Map.get(envelope, "kind") == "notification" and is_binary(Map.get(envelope, "user_did")) ->
        :ok

      match?(%{"recipient_dids" => list} when is_list(list), envelope) ->
        %{"recipient_dids" => list} = envelope
        if list != [] and Enum.all?(list, &is_binary/1), do: :ok, else: :error

      match?(%{"recipient_did" => did} when is_binary(did), envelope) ->
        :ok

      true ->
        :error
    end
  end

  defp validate_envelope_recipients(_), do: :error

  defp verify_inbox_envelope(%{"kind" => "notification"} = envelope, anchor) do
    NotificationSignature.verify(envelope, anchor)
  end

  defp verify_inbox_envelope(%{"kind" => "dm"} = envelope, _anchor) do
    DeviceSignature.verify(envelope)
  end

  defp verify_inbox_envelope(envelope, _anchor) do
    DeviceSignature.verify(envelope)
  end

  defp append_envelope(%{"recipient_dids" => recipient_dids} = envelope)
       when is_list(recipient_dids) do
    Enum.reduce_while(recipient_dids, {:ok, []}, fn did, {:ok, acks} ->
      case Federation.append_inbox(did, envelope) do
        {:ok, _} -> {:cont, {:ok, [delivery_ack(envelope, did) | acks]}}
        {:error, _} -> {:halt, {:error, :append_failed}}
      end
    end)
    |> case do
      {:ok, acks} -> {:ok, Enum.reverse(acks)}
      error -> error
    end
  end

  defp append_envelope(%{"recipient_did" => did} = envelope) when is_binary(did) do
    case Federation.append_inbox(did, envelope) do
      {:ok, _} -> {:ok, [delivery_ack(envelope, did)]}
      {:error, _} -> {:error, :append_failed}
    end
  end

  defp append_envelope(%{"kind" => "notification", "user_did" => did} = envelope)
       when is_binary(did) do
    case Federation.append_inbox(did, envelope) do
      {:ok, _} -> {:ok, []}
      {:error, _} -> {:error, :append_failed}
    end
  end

  defp append_envelope(_), do: {:error, :append_failed}

  defp delivery_ack(envelope, did) do
    unsigned = %{
      "envelope_id" => Map.fetch!(envelope, "envelope_id"),
      "recipient_did" => did,
      "recipient_anchor" => Federation.local_anchor_host(),
      "delivered_at" => DateTime.utc_now() |> DateTime.to_iso8601()
    }

    sign_server_message(unsigned)
  end

  defp push_delivery_acks(anchor, acks) do
    Enum.each(acks, fn ack ->
      _ = Federation.Client.push_delivery_ack!(anchor, ack)
    end)

    :ok
  end

  defp sign_server_message(unsigned) do
    {:ok, signature, key_id} = Federation.sign(unsigned)

    unsigned
    |> Map.put("key_id", key_id)
    |> Map.put("server_signature", Base.encode64(signature))
  end

  defp outbound_read_receipts_enabled(%{"recipient_did" => did}) when is_binary(did) do
    case Identity.get_identity_by_did(did) do
      {:ok, %Identity.Identity{read_receipts_enabled: false}} ->
        {:error, :read_receipts_disabled}

      _ ->
        :ok
    end
  end

  defp outbound_read_receipts_enabled(_), do: {:error, :invalid_read_marker}

  defp consume_delivery_budget(anchor) when is_binary(anchor) do
    DeliveryBudget.consume(anchor)
  end

  defp consume_delivery_budget(_), do: {:error, {:rate_limited, 60}}

  defp serialize_entry(entry) do
    %{
      "envelope_id" => entry.envelope_id,
      "recipient_did" => entry.recipient_did,
      "conversation_id" => entry.conversation_id,
      "kind" => entry.kind,
      "inbox_serial" => entry.inbox_serial,
      "envelope" => entry.envelope
    }
  end

  defp with_inner(conn, params, fun) do
    case Wrapper.unwrap(params, []) do
      {:ok, inner, anchor} -> fun.(inner, anchor)
      {:error, :invalid_signature} -> error(conn, 401, "invalid_signature")
      {:error, :replay} -> error(conn, 409, "replay")
      {:error, _} -> error(conn, 400, "malformed")
    end
  end

  defp authorize_presence_subscribe(did, anchor) do
    if PresenceBroker.subscriber_allowed?(did, anchor) do
      :ok
    else
      {:error, :unauthorized_presence}
    end
  end

  defp authorize_presence_notify(did, anchor) do
    with true <- is_binary(anchor) and anchor != "",
         {:ok, %Identity.Identity{anchor_list: anchors}} <- Identity.get_identity_by_did(did),
         normalized_anchor = AnchorHost.normalize(anchor),
         true <- normalized_anchor in Enum.map(anchors || [], &AnchorHost.normalize/1) do
      :ok
    else
      _ -> {:error, :unauthorized_presence}
    end
  end

  defp int_arg(map, key, default) do
    case Map.get(map, key, default) do
      n when is_integer(n) -> n
      _ -> default
    end
  end

  defp ok(conn, body), do: json(conn, body)

  defp rate_limited(conn, anchor, retry_after) do
    :telemetry.execute(
      [:yawp, :federation, :delivery_budget, :rate_limited],
      %{count: 1, retry_after: retry_after},
      %{peer_anchor: anchor}
    )

    conn
    |> put_resp_header("retry-after", Integer.to_string(retry_after))
    |> error(429, "rate_limited")
  end

  defp error(conn, status, slug) do
    conn
    |> put_status(status)
    |> json(%{"error" => slug})
  end
end
