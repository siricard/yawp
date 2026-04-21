defmodule Yawp.Channels.Message.Changes.VerifyMessageSignature do
  @moduledoc """
  verifies the ed25519 signature on a `Yawp.Channels.Message.:send`
  changeset.

  The signature is computed over the RFC 8785 canonical-JSON of
  `%{channel_id, body, ts}`, with the device subkey identified by
  `signed_by`. The signing key is resolved from the author identity's
  `device_subkeys.subkeys` JSONB; if the device subkey is unknown OR the
  signature does not verify, the change adds an `invalid_signature` error
  and short-circuits the action (no row is written).

  On success the raw 64-byte signature is stored on the resource's
  `:signature` attribute (the action accepts the base64url string and we
  swap it for the bytes here).
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    sig_b64 = Ash.Changeset.get_argument(changeset, :signature)
    ts = Ash.Changeset.get_argument(changeset, :ts)
    body = Ash.Changeset.get_attribute(changeset, :body)
    channel_id = Ash.Changeset.get_attribute(changeset, :channel_id)
    author_identity_id = Ash.Changeset.get_attribute(changeset, :author_identity_id)
    signed_by = Ash.Changeset.get_attribute(changeset, :signed_by)

    with {:ok, sig_bytes} <- decode_b64(sig_b64, 64),
         {:ok, identity} <- fetch_identity(author_identity_id),
         {:ok, device_pk} <- lookup_device_pk(identity, signed_by),
         canonical <- build_canonical(channel_id, body, ts),
         true <- :crypto.verify(:eddsa, :none, canonical, sig_bytes, [device_pk, :ed25519]) do
      Ash.Changeset.force_change_attribute(changeset, :signature, sig_bytes)
    else
      _ ->
        Ash.Changeset.add_error(changeset, field: :signature, message: "invalid_signature")
    end
  end

  defp decode_b64(nil, _), do: :error

  defp decode_b64(b64, expected_size) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, raw} when byte_size(raw) == expected_size -> {:ok, raw}
      _ -> :error
    end
  end

  defp decode_b64(_, _), do: :error

  defp fetch_identity(nil), do: :error

  defp fetch_identity(identity_id) do
    case Ash.get(Yawp.Identity.Identity, identity_id, authorize?: false) do
      {:ok, identity} -> {:ok, identity}
      _ -> :error
    end
  end

  defp lookup_device_pk(_identity, nil), do: :error

  defp lookup_device_pk(identity, signed_by) do
    subkeys =
      identity.device_subkeys
      |> Kernel.||(%{})
      |> Map.get("subkeys", [])

    case Enum.find(subkeys, fn s -> Map.get(s, "device_id") == signed_by end) do
      nil ->
        :error

      %{"pk" => pk_b64} ->
        case Base.url_decode64(pk_b64, padding: false) do
          {:ok, pk} when byte_size(pk) == 32 -> {:ok, pk}
          _ -> :error
        end

      _ ->
        :error
    end
  end

  defp build_canonical(channel_id, body, ts) do
    Yawp.CanonicalJson.encode(%{
      "body" => body,
      "channel_id" => channel_id,
      "ts" => ts
    })
  end
end
