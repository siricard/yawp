defmodule Yawp.Servers.Message.Signature do
  @moduledoc """
  Shared ed25519 verification helpers for the channel message-store
  actions (send / edit / delete).

  A signed event names its author by DID and the device subkey
  (`signed_by`) that produced the signature. `verify/3` resolves the
  device public key from the author identity's `device_subkeys` JSONB and
  checks the signature over the supplied canonical-JSON bytes.
  """

  require Ash.Query

  @spec verify(String.t() | nil, String.t() | nil, String.t() | nil, iodata()) ::
          {:ok, Yawp.Identity.Identity.t()} | :error
  def verify(did, signed_by, sig_b64, canonical) do
    with {:ok, sig} <- decode_b64(sig_b64, 64),
         {:ok, identity} <- fetch_identity(did),
         {:ok, pk} <- lookup_device_pk(identity, signed_by),
         true <- :crypto.verify(:eddsa, :none, canonical, sig, [pk, :ed25519]) do
      {:ok, identity}
    else
      _ -> :error
    end
  end

  @spec decode_signature(String.t() | nil) :: {:ok, binary()} | :error
  def decode_signature(sig_b64), do: decode_b64(sig_b64, 64)

  defp decode_b64(b64, size) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, raw} when byte_size(raw) == size -> {:ok, raw}
      _ -> :error
    end
  end

  defp decode_b64(_, _), do: :error

  defp fetch_identity(did) when is_binary(did) do
    Yawp.Identity.Identity
    |> Ash.Query.filter(did == ^did)
    |> Ash.read_one(authorize?: false)
    |> case do
      {:ok, %Yawp.Identity.Identity{} = identity} -> {:ok, identity}
      _ -> :error
    end
  end

  defp fetch_identity(_), do: :error

  defp lookup_device_pk(_identity, nil), do: :error

  defp lookup_device_pk(identity, signed_by) do
    subkeys =
      identity.device_subkeys
      |> Kernel.||(%{})
      |> Map.get("subkeys", [])

    case Enum.find(subkeys, fn s -> Map.get(s, "device_id") == signed_by end) do
      %{"pk" => pk_b64} -> decode_pk(pk_b64)
      _ -> :error
    end
  end

  defp decode_pk(pk_b64) do
    case Base.url_decode64(pk_b64, padding: false) do
      {:ok, pk} when byte_size(pk) == 32 -> {:ok, pk}
      _ -> :error
    end
  end
end
