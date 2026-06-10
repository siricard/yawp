defmodule Yawp.Federation.DeviceSignature do
  @moduledoc false

  alias Yawp.CanonicalJson
  alias Yawp.Federation.Client
  alias Yawp.Federation.InnerSignature
  alias Yawp.Identity

  @spec verify(map()) ::
          :ok | {:error, :invalid_inner_signature | :unresolvable_sender}
  def verify(envelope) when is_map(envelope) do
    with sender_did when is_binary(sender_did) <- Map.get(envelope, "sender_did", :missing),
         signed_by when is_binary(signed_by) and signed_by != "" <-
           Map.get(envelope, "signed_by", :missing),
         sig_b64 when is_binary(sig_b64) <- Map.get(envelope, "sender_signature", :missing),
         {:ok, sig} <- decode(sig_b64, 64),
         {:ok, ppe} <- resolve_sender_ppe(sender_did, envelope),
         {:ok, device_pk} <- device_pk_from_ppe(ppe, signed_by),
         true <- verify_signature(envelope, sig, device_pk) do
      :ok
    else
      {:error, :unresolvable_sender} -> {:error, :unresolvable_sender}
      _ -> {:error, :invalid_inner_signature}
    end
  end

  def verify(_envelope), do: {:error, :invalid_inner_signature}

  defp resolve_sender_ppe(sender_did, envelope) do
    case Identity.get_ppe_by_did(sender_did) do
      {:ok, %Identity.Ppe{envelope: cached}} when is_map(cached) ->
        maybe_refresh_cached_ppe(sender_did, cached, envelope)

      _ ->
        # A sender anchored on this server is authoritative locally: its
        # master key and device delegations live on the Identity row even
        # before a signed PPE has been published/replicated. Prefer that row
        # so a freshly bound sender verifies without a (self-directed) PPE
        # fetch, and only fall back to federation when no local row exists.
        case local_identity_ppe(sender_did) do
          {:ok, ppe} -> {:ok, ppe}
          {:error, _} -> fetch_sender_ppe(sender_did, sender_anchors(envelope))
        end
    end
  end

  defp local_identity_ppe(sender_did) do
    case Identity.get_identity_by_did(sender_did) do
      {:ok, %Identity.Identity{master_public_key: master_pk, device_subkeys: subkeys}}
      when is_binary(master_pk) ->
        {:ok,
         %{
           "did" => sender_did,
           "public_key" => Base.url_encode64(master_pk, padding: false),
           "device_subkeys" => device_subkey_records(subkeys)
         }}

      _ ->
        {:error, :unresolvable_sender}
    end
  end

  defp device_subkey_records(%{"subkeys" => subkeys}) when is_list(subkeys), do: subkeys
  defp device_subkey_records(_), do: []

  defp maybe_refresh_cached_ppe(sender_did, cached, envelope) do
    signed_by = Map.get(envelope, "signed_by")

    if refresh_cached_ppe?(cached, envelope, signed_by) do
      case fetch_sender_ppe(sender_did, sender_anchors_from_cached(cached, envelope)) do
        {:ok, fresh} -> {:ok, fresh}
        {:error, _} -> {:ok, cached}
      end
    else
      {:ok, cached}
    end
  end

  defp refresh_cached_ppe?(cached, envelope, signed_by) do
    advertised_version = Map.get(envelope, "sender_profile_version")
    cached_version = Map.get(cached, "profile_version")

    newer_profile? =
      is_integer(advertised_version) and
        (not is_integer(cached_version) or advertised_version > cached_version)

    missing_device? =
      is_binary(signed_by) and
        match?({:error, :missing_device}, delegated_device_pk(cached, signed_by))

    newer_profile? or missing_device?
  end

  defp fetch_sender_ppe(_sender_did, []), do: {:error, :unresolvable_sender}

  defp fetch_sender_ppe(sender_did, [anchor | rest]) do
    case fetch_and_apply(anchor, sender_did) do
      {:ok, envelope} -> {:ok, envelope}
      {:error, _} -> fetch_sender_ppe(sender_did, rest)
    end
  end

  defp fetch_and_apply(anchor, sender_did) do
    with {:ok, envelope} <- Client.fetch_ppe!(anchor, sender_did),
         true <- Map.get(envelope, "did") == sender_did,
         :ok <- InnerSignature.verify(envelope, "did", "signature"),
         {:ok, _status} <- Identity.apply_ppe_if_newer(envelope) do
      {:ok, envelope}
    else
      _ -> {:error, :unusable_ppe}
    end
  end

  defp sender_anchors(envelope) do
    case Map.get(envelope, "sender_anchors") do
      anchors when is_list(anchors) -> Enum.filter(anchors, &(is_binary(&1) and &1 != ""))
      _ -> []
    end
  end

  defp sender_anchors_from_cached(cached, envelope) do
    ppe_anchors =
      case Map.get(cached, "anchors") do
        anchors when is_list(anchors) -> anchors
        _ -> []
      end

    (sender_anchors(envelope) ++ ppe_anchors)
    |> Enum.filter(&(is_binary(&1) and &1 != ""))
    |> Enum.uniq()
  end

  defp device_pk_from_ppe(ppe, signed_by) do
    case delegated_device_pk(ppe, signed_by) do
      {:ok, device_pk} -> {:ok, device_pk}
      _ -> :error
    end
  end

  defp delegated_device_pk(ppe, signed_by) do
    subkeys =
      case Map.get(ppe, "device_subkeys") do
        list when is_list(list) -> list
        _ -> []
      end

    case Enum.find(subkeys, fn s -> is_map(s) and Map.get(s, "device_id") == signed_by end) do
      %{"pk" => pk_b64, "signature" => sig_b64, "issued_at" => issued_at} ->
        with {:ok, master_pk} <- decode(Map.get(ppe, "public_key"), 32),
             {:ok, device_pk} <- decode(pk_b64, 32),
             {:ok, delegation_sig} <- decode(sig_b64, 64),
             true <-
               verify_device_delegation(signed_by, pk_b64, issued_at, delegation_sig, master_pk) do
          {:ok, device_pk}
        else
          _ -> {:error, :invalid_delegation}
        end

      _ ->
        {:error, :missing_device}
    end
  end

  defp verify_device_delegation(device_id, pk_b64, issued_at, signature, master_pk)
       when is_binary(device_id) and is_binary(pk_b64) and is_binary(issued_at) do
    canonical =
      CanonicalJson.encode(%{
        "device_id" => device_id,
        "pk" => pk_b64,
        "issued_at" => issued_at
      })

    :crypto.verify(:eddsa, :none, canonical, signature, [master_pk, :ed25519])
  rescue
    _ -> false
  end

  defp verify_device_delegation(_, _, _, _, _), do: false

  defp verify_signature(envelope, sig, device_pk) do
    canonical =
      envelope
      |> Map.delete("sender_signature")
      |> CanonicalJson.encode()

    :crypto.verify(:eddsa, :none, canonical, sig, [device_pk, :ed25519])
  rescue
    _ -> false
  end

  defp decode(value, byte_length) when is_binary(value) do
    raw = String.replace_prefix(value, "ed25519:", "")

    decoded =
      case Base.url_decode64(raw, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(raw, padding: false)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == byte_length -> {:ok, bytes}
      _ -> :error
    end
  end

  defp decode(_value, _byte_length), do: :error
end
