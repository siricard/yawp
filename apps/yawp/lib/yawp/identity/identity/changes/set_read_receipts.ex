defmodule Yawp.Identity.Identity.Changes.SetReadReceipts do
  @moduledoc false

  use Ash.Resource.Change

  alias Yawp.Identity
  alias Yawp.Identity.Identity, as: IdentityResource
  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      identity = changeset.data
      enabled = Ash.Changeset.get_attribute(changeset, :read_receipts_enabled)

      if authorized?(changeset, identity) and is_boolean(enabled) do
        case mirror_preference(identity.did, enabled) do
          {:ok, _} -> changeset
          {:error, error} -> Ash.Changeset.add_error(changeset, error)
        end
      else
        Ash.Changeset.add_error(changeset, RpcError.exception(type: "unauthorized"))
      end
    end)
  end

  defp authorized?(changeset, identity) do
    case changeset.context[:private][:actor] || actor_from_context(changeset) do
      %IdentityResource{did: did} -> did == identity.did
      %{did: did} -> did == identity.did
      _ -> false
    end
  end

  defp actor_from_context(changeset) do
    case changeset.context do
      %{actor: actor} -> actor
      _ -> nil
    end
  end

  defp mirror_preference(did, enabled) do
    {blob, version} =
      case Identity.get_private_blob_by_did(did) do
        {:ok, %Identity.PrivateBlob{ciphertext: ciphertext, blob_version: current}} ->
          {decode_blob(ciphertext), current + 1}

        _ ->
          {%{}, 1}
      end

    Identity.PrivateBlob
    |> Ash.Changeset.for_create(:upsert, %{
      did: did,
      ciphertext: Jason.encode!(Map.put(blob, "read_receipts_enabled", enabled)),
      blob_version: version
    })
    |> Ash.create(authorize?: false)
  end

  defp decode_blob(ciphertext) when is_binary(ciphertext) do
    case Jason.decode(ciphertext) do
      {:ok, blob} when is_map(blob) -> blob
      _ -> %{}
    end
  end

  defp decode_blob(_), do: %{}
end
