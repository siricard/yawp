defmodule Yawp.Federation.DmEnvelope do
  @moduledoc false

  alias Yawp.CanonicalJson

  @enforce_keys [
    :envelope_id,
    :sender_did,
    :recipient_dids,
    :conversation_id,
    :timestamp,
    :body,
    :attachments,
    :reply_to,
    :mentions
  ]
  defstruct [
    :envelope_id,
    :sender_did,
    :recipient_dids,
    :conversation_id,
    :timestamp,
    :body,
    :attachments,
    :reply_to,
    :mentions,
    :sender_signature
  ]

  @type t :: %__MODULE__{
          envelope_id: String.t(),
          sender_did: String.t(),
          recipient_dids: [String.t()],
          conversation_id: String.t(),
          timestamp: String.t(),
          body: String.t(),
          attachments: [map()],
          reply_to: String.t() | nil,
          mentions: [map()],
          sender_signature: String.t() | nil
        }

  @spec conversation_id(String.t() | [String.t()], [String.t()] | nil) :: String.t()
  def conversation_id(sender_did, recipient_dids \\ nil)

  def conversation_id(sender_did, recipient_dids)
      when is_binary(sender_did) and is_list(recipient_dids) do
    [sender_did | recipient_dids]
    |> Enum.filter(&is_binary/1)
    |> Enum.uniq()
    |> Enum.sort()
    |> CanonicalJson.encode()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  def conversation_id(participants, nil) when is_list(participants) do
    participants
    |> Enum.filter(&is_binary/1)
    |> Enum.uniq()
    |> Enum.sort()
    |> CanonicalJson.encode()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  @spec generate_envelope_id() :: String.t()
  def generate_envelope_id do
    16
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  @spec sign(t() | map(), binary() | (binary() -> binary())) ::
          {:ok, t() | map()} | {:error, :invalid_envelope | :invalid_signature}
  def sign(envelope, signer) do
    with {:ok, canonical} <- signing_input(envelope),
         {:ok, signature} <- sign_canonical(canonical, signer) do
      {:ok, put_signature(envelope, Base.url_encode64(signature, padding: false))}
    end
  end

  @spec verify(t() | map(), map()) :: :ok | {:error, :invalid_signature}
  def verify(envelope, ppe) when is_map(ppe) do
    with signature when is_binary(signature) <- get_field(envelope, :sender_signature),
         {:ok, sig} <- decode(signature, 64),
         true <- conversation_id_matches?(envelope),
         {:ok, canonical} <- signing_input(envelope),
         [_ | _] = keys <- delegated_device_keys(ppe),
         true <- Enum.any?(keys, &verify_with_key(canonical, sig, &1)) do
      :ok
    else
      _ -> {:error, :invalid_signature}
    end
  end

  def verify(_envelope, _ppe), do: {:error, :invalid_signature}

  defp sign_canonical(canonical, signer) when is_function(signer, 1) do
    case signer.(canonical) do
      signature when is_binary(signature) and byte_size(signature) == 64 -> {:ok, signature}
      _ -> {:error, :invalid_signature}
    end
  rescue
    _ -> {:error, :invalid_signature}
  end

  defp sign_canonical(canonical, private_key) when is_binary(private_key) do
    {:ok, :crypto.sign(:eddsa, :none, canonical, [private_key, :ed25519])}
  rescue
    _ -> {:error, :invalid_signature}
  end

  defp sign_canonical(_canonical, _signer), do: {:error, :invalid_signature}

  defp signing_input(envelope) when is_map(envelope) do
    {:ok,
     envelope
     |> signing_map()
     |> Map.delete("sender_signature")
     |> CanonicalJson.encode()}
  rescue
    _ -> {:error, :invalid_envelope}
  end

  defp signing_input(_envelope), do: {:error, :invalid_envelope}

  defp conversation_id_matches?(envelope) do
    sender_did = get_field(envelope, :sender_did)
    recipient_dids = get_field(envelope, :recipient_dids)
    supplied_conversation_id = get_field(envelope, :conversation_id)

    is_binary(sender_did) and is_list(recipient_dids) and
      supplied_conversation_id == conversation_id(sender_did, recipient_dids)
  rescue
    _ -> false
  end

  defp signing_map(%__MODULE__{} = envelope) do
    envelope
    |> Map.from_struct()
    |> Enum.into(%{}, fn {key, value} -> {Atom.to_string(key), value} end)
  end

  defp signing_map(envelope) when is_map(envelope) do
    Enum.into(envelope, %{}, fn {key, value} -> {key_to_string(key), value} end)
  end

  defp key_to_string(key) when is_atom(key), do: Atom.to_string(key)
  defp key_to_string(key) when is_binary(key), do: key

  defp put_signature(%__MODULE__{} = envelope, signature),
    do: %{envelope | sender_signature: signature}

  defp put_signature(envelope, signature) when is_map(envelope),
    do: Map.put(envelope, "sender_signature", signature)

  defp get_field(%__MODULE__{} = envelope, field), do: Map.fetch!(envelope, field)

  defp get_field(envelope, field) when is_map(envelope),
    do: Map.get(envelope, Atom.to_string(field))

  defp delegated_device_keys(ppe) do
    master_pk = Map.get(ppe, "public_key")

    ppe
    |> device_subkeys()
    |> Enum.flat_map(fn device ->
      case delegated_device_key(device, master_pk) do
        {:ok, key} -> [key]
        _ -> []
      end
    end)
  end

  defp device_subkeys(ppe) do
    case Map.get(ppe, "device_subkeys") do
      %{"subkeys" => subkeys} when is_list(subkeys) -> subkeys
      subkeys when is_list(subkeys) -> subkeys
      _ -> []
    end
  end

  defp delegated_device_key(
         %{
           "device_id" => device_id,
           "pk" => pk_b64,
           "issued_at" => issued_at,
           "signature" => sig_b64
         },
         master_pk_b64
       )
       when is_binary(device_id) and is_binary(pk_b64) and is_binary(issued_at) do
    with {:ok, master_pk} <- decode(master_pk_b64, 32),
         {:ok, device_pk} <- decode(pk_b64, 32),
         {:ok, sig} <- decode(sig_b64, 64),
         true <- verify_delegation(device_id, pk_b64, issued_at, sig, master_pk) do
      {:ok, device_pk}
    else
      _ -> :error
    end
  end

  defp delegated_device_key(_device, _master_pk_b64), do: :error

  defp verify_delegation(device_id, pk_b64, issued_at, signature, master_pk) do
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

  defp verify_with_key(canonical, signature, public_key) do
    :crypto.verify(:eddsa, :none, canonical, signature, [public_key, :ed25519])
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
