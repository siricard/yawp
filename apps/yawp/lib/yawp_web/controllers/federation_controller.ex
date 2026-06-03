defmodule YawpWeb.FederationController do
  @moduledoc """
  Inbound anchor-to-anchor federation endpoints.

  Every request body is a signed delivery wrapper
  (`Yawp.Federation.Wrapper`): the relaying anchor canonicalises a
  small wrapper map, signs it with its server key, and carries the
  inner payload alongside bound by hash. Each action unwraps and
  verifies the wrapper — rejecting tampered signatures, hash
  mismatches, and replays — *before* touching the inner payload, then
  applies the payload to local state via the appropriate domain call.

  - `POST /federation/ppe/push` — apply an inbound PPE if newer.
  - `POST /federation/blob/push` — persist an inbound private blob if newer.
  - `POST /federation/inbox/push` — append a DM/notification envelope to the inbox.
  - `POST /federation/devices/changed` — apply a device-subkey change to an identity.
  - `POST /federation/pull` — return recent inbox envelopes since a cursor.
  """

  use YawpWeb, :controller

  alias Yawp.Federation
  alias Yawp.Federation.Wrapper
  alias Yawp.Identity

  def ppe_push(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      case Identity.apply_ppe_if_newer(inner) do
        {:ok, status} -> ok(conn, %{"status" => status})
        {:error, _} -> error(conn, 422, "invalid_ppe")
      end
    end)
  end

  def blob_push(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      with %{"did" => did, "ciphertext" => ct_b64, "blob_version" => version}
           when is_binary(did) and is_binary(ct_b64) and is_integer(version) <- inner,
           {:ok, ciphertext} <- Base.decode64(ct_b64),
           {:ok, status} <- Identity.apply_blob_if_newer(did, ciphertext, version) do
        ok(conn, %{"status" => status})
      else
        _ -> error(conn, 422, "invalid_blob")
      end
    end)
  end

  def inbox_push(conn, params) do
    with_inner(conn, params, fn inner, _anchor ->
      case append_envelope(inner) do
        :ok -> ok(conn, %{"status" => "appended"})
        :error -> error(conn, 422, "invalid_envelope")
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
           {:ok, _identity} <-
             Identity.apply_device_subkey_change(did, subkeys, Map.get(inner, "profile_version")) do
        ok(conn, %{"status" => "applied"})
      else
        {:error, :not_found} -> error(conn, 404, "unknown_identity")
        _ -> error(conn, 422, "invalid_device_change")
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

  defp append_envelope(%{"recipient_dids" => recipient_dids} = envelope)
       when is_list(recipient_dids) and recipient_dids != [] do
    Enum.reduce_while(recipient_dids, :ok, fn did, _acc ->
      case Federation.append_inbox(did, envelope) do
        {:ok, _} -> {:cont, :ok}
        {:error, _} -> {:halt, :error}
      end
    end)
  rescue
    KeyError -> :error
  end

  defp append_envelope(%{"recipient_did" => did} = envelope) when is_binary(did) do
    case Federation.append_inbox(did, envelope) do
      {:ok, _} -> :ok
      {:error, _} -> :error
    end
  rescue
    KeyError -> :error
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
