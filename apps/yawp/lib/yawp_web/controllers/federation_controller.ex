defmodule YawpWeb.FederationController do
  @moduledoc false

  use YawpWeb, :controller

  alias Yawp.Federation
  alias Yawp.Federation.InnerSignature
  alias Yawp.Federation.MessagePipeline
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
    with_inner(conn, params, fn inner, _anchor ->
      with :ok <- validate_envelope_recipients(inner),
           :ok <- InnerSignature.verify(inner, "sender_did", "sender_signature"),
           :ok <- append_envelope(inner) do
        MessagePipeline.maybe_refresh_ppe(inner)
        ok(conn, %{"status" => "appended"})
      else
        {:error, :invalid_inner_signature} -> error(conn, 403, "invalid_inner_signature")
        _ -> error(conn, 422, "invalid_envelope")
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
    with_inner(conn, params, fn inner, _anchor ->
      with %{"did" => did, "peer_host" => peer_host}
           when is_binary(did) and is_binary(peer_host) <- inner do
        :ok = PresenceBroker.subscribe(did, peer_host)
        ok(conn, %{"status" => "subscribed"})
      else
        _ -> error(conn, 422, "invalid_subscribe")
      end
    end)
  end

  def presence_notify(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with %{"did" => did, "state" => state}
           when is_binary(did) and state in ["online", "idle", "offline"] <- inner do
        :ok = RemotePresence.apply(did, state)
        ok(conn, %{"status" => "noted"})
      else
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

  defp append_envelope(%{"recipient_dids" => recipient_dids} = envelope)
       when is_list(recipient_dids) do
    Enum.reduce_while(recipient_dids, :ok, fn did, _acc ->
      case Federation.append_inbox(did, envelope) do
        {:ok, _} -> {:cont, :ok}
        {:error, _} -> {:halt, :error}
      end
    end)
  end

  defp append_envelope(%{"recipient_did" => did} = envelope) when is_binary(did) do
    case Federation.append_inbox(did, envelope) do
      {:ok, _} -> :ok
      {:error, _} -> :error
    end
  end

  defp append_envelope(_), do: :error

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

  defp int_arg(map, key, default) do
    case Map.get(map, key, default) do
      n when is_integer(n) -> n
      _ -> default
    end
  end

  defp ok(conn, body), do: json(conn, body)

  defp error(conn, status, slug) do
    conn
    |> put_status(status)
    |> json(%{"error" => slug})
  end
end
