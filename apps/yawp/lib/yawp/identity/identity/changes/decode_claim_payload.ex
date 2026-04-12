defmodule Yawp.Identity.Identity.Changes.DecodeClaimPayload do
  @moduledoc """
  base64url-decodes the `pk` and `sender_signature`
  arguments, validates their byte sizes, and stashes the raw bytes on the
  changeset context under `:pk_bytes` and `:sig_bytes`. Also forces the
  `:master_public_key` attribute so the subsequent DID-derivation and
  upsert changes have it available.

  On any shape failure adds an `invalid_payload`-typed error and halts
  the pipeline.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &decode/1)
  end

  defp decode(%{valid?: false} = changeset), do: changeset

  defp decode(changeset) do
    pk_b64 = Ash.Changeset.get_argument(changeset, :pk)
    sig_b64 = Ash.Changeset.get_argument(changeset, :sender_signature)
    did = Ash.Changeset.get_argument(changeset, :did)

    with true <- is_binary(pk_b64) and is_binary(sig_b64) and is_binary(did),
         {:ok, pk} <- Base.url_decode64(pk_b64, padding: false),
         {:ok, sig} <- Base.url_decode64(sig_b64, padding: false),
         true <- byte_size(pk) == 32,
         true <- byte_size(sig) == 64 do
      changeset
      |> Ash.Changeset.put_context(:pk_bytes, pk)
      |> Ash.Changeset.put_context(:sig_bytes, sig)
      |> Ash.Changeset.force_change_attribute(:master_public_key, pk)
      |> Ash.Changeset.force_change_attribute(:did, did)
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "invalid_payload", message: "invalid_payload")
        )
    end
  end
end
