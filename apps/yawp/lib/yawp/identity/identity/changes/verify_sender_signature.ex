defmodule Yawp.Identity.Identity.Changes.VerifySenderSignature do
  @moduledoc """
  verifies the ed25519 signature attached to a
  claim request. Reads the decoded pk and signature bytes from the
  changeset context (stashed by `DecodeClaimPayload`), reconstructs the
  canonical-JSON payload from the original action arguments, and
  rejects the changeset with an `invalid_signature`-typed RPC error if
  the signature does not verify.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(changeset) do
    with %{pk_bytes: pk, sig_bytes: sig} when is_binary(pk) and is_binary(sig) <-
           changeset.context,
         canonical <- build_canonical(changeset),
         true <- :crypto.verify(:eddsa, :none, canonical, sig, [pk, :ed25519]) do
      changeset
    else
      false ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "invalid_signature", message: "invalid_signature")
        )

      _ ->
                                changeset
    end
  end

  defp build_canonical(changeset) do
    Yawp.CanonicalJson.encode(%{
      "claim_token" => Ash.Changeset.get_argument(changeset, :claim_token),
      "did" => Ash.Changeset.get_argument(changeset, :did),
      "pk" => Ash.Changeset.get_argument(changeset, :pk)
    })
  end
end
