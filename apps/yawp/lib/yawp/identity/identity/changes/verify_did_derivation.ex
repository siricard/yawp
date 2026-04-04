defmodule Yawp.Identity.Identity.Changes.VerifyDidDerivation do
  @moduledoc """
  Enforces the DID-derivation invariant at the resource boundary. Reads `:did` and `:master_public_key` from the
  changeset attributes; rejects the changeset if
  `did != "did:yawp:" <> did_from_pubkey(master_public_key)`.

  This guarantees that any caller of `:upsert_chat_owner` — controller,
  Phoenix Channel, Oban job, iex — cannot persist a mismatched
  DID/public-key pair. The `POST /api/claim` controller still emits an
  early `did_mismatch` slug for the right HTTP shape, but the action
  is now the source of truth for the invariant.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(changeset) do
    did = Ash.Changeset.get_attribute(changeset, :did)
    pk = Ash.Changeset.get_attribute(changeset, :master_public_key)

    cond do
      not is_binary(did) or not is_binary(pk) ->
        changeset

      byte_size(pk) != 32 ->
        Ash.Changeset.add_error(changeset, field: :master_public_key, message: "must be 32 bytes")

      did == "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk) ->
        changeset

      true ->
        Ash.Changeset.add_error(changeset,
          field: :did,
          message: "does not match master_public_key"
        )
    end
  end
end
