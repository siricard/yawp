defmodule Yawp.Identity.Identity.Changes.BindDevice do
  @moduledoc """
  verifies the master-key delegation signature for a new
  device subkey and, on success, appends the subkey to
  `device_subkeys.subkeys`, appends `anchor_url` to `anchor_list` if
  missing, and bumps `profile_version`.

  Rules:

    - The signature is verified against `master_public_key` over the
      canonical JSON `%{"device_id" => ..., "pk" => ..., "issued_at" => ...}`
      (RFC 8785; see `Yawp.CanonicalJson`). `pk` is the base64url
      encoding of the device public key bytes; `issued_at` is the
      ISO-8601 representation of the UTC timestamp.

    - Re-binding the SAME `device_id` is a no-op: the existing subkey
      entry is preserved (first-write-wins), the anchor list is
      append-if-missing, and `profile_version` is NOT bumped.

    - Binding to a NEW `device_id` appends the subkey, appends the
      anchor if new, and increments `profile_version`.

   will layer the RPC wire shape (pre-auth sender
  signature, action metadata for session tokens) on top of this base
  action.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &apply_bind/1)
  end

  defp apply_bind(%{valid?: false} = changeset), do: changeset

  defp apply_bind(changeset) do
    device_id = Ash.Changeset.get_argument(changeset, :device_id)
    device_pk_b64 = Ash.Changeset.get_argument(changeset, :device_pk)
    device_sig_b64 = Ash.Changeset.get_argument(changeset, :device_signature)
    issued_at = Ash.Changeset.get_argument(changeset, :issued_at)
    anchor_url = Ash.Changeset.get_argument(changeset, :anchor_url)

    with {:ok, _device_pk} <- decode_b64(device_pk_b64, 32),
         {:ok, device_sig} <- decode_b64(device_sig_b64, 64),
         master_pk when is_binary(master_pk) <-
           Ash.Changeset.get_attribute(changeset, :master_public_key),
         issued_at_iso = DateTime.to_iso8601(issued_at),
         canonical =
           Yawp.CanonicalJson.encode(%{
             "device_id" => device_id,
             "pk" => device_pk_b64,
             "issued_at" => issued_at_iso
           }),
         true <- :crypto.verify(:eddsa, :none, canonical, device_sig, [master_pk, :ed25519]) do
      mutate(changeset, device_id, device_pk_b64, device_sig_b64, issued_at_iso, anchor_url)
    else
      false ->
        Ash.Changeset.add_error(changeset,
          field: :device_signature,
          message: "invalid device_signature"
        )

      :error ->
        Ash.Changeset.add_error(changeset,
          field: :device_signature,
          message: "invalid device_signature payload"
        )

      _ ->
        Ash.Changeset.add_error(changeset,
          field: :device_signature,
          message: "invalid device_signature"
        )
    end
  end

  defp decode_b64(nil, _), do: :error

  defp decode_b64(b64, expected_size) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, raw} when byte_size(raw) == expected_size -> {:ok, raw}
      _ -> :error
    end
  end

  defp mutate(changeset, device_id, device_pk_b64, device_sig_b64, issued_at_iso, anchor_url) do
    existing = Ash.Changeset.get_attribute(changeset, :device_subkeys) || %{"subkeys" => []}
    subkeys = Map.get(existing, "subkeys", [])

    already_bound? = Enum.any?(subkeys, fn s -> Map.get(s, "device_id") == device_id end)

    new_subkeys =
      if already_bound? do
        subkeys
      else
        subkeys ++
          [
            %{
              "device_id" => device_id,
              "pk" => device_pk_b64,
              "signature" => device_sig_b64,
              "issued_at" => issued_at_iso
            }
          ]
      end

    anchors = Ash.Changeset.get_attribute(changeset, :anchor_list) || []

    new_anchors =
      if anchor_url in anchors, do: anchors, else: anchors ++ [anchor_url]

    current_version = Ash.Changeset.get_attribute(changeset, :profile_version) || 0
    new_version = if already_bound?, do: current_version, else: current_version + 1

    changeset
    |> Ash.Changeset.force_change_attribute(:device_subkeys, %{"subkeys" => new_subkeys})
    |> Ash.Changeset.force_change_attribute(:anchor_list, new_anchors)
    |> Ash.Changeset.force_change_attribute(:profile_version, new_version)
  end
end
