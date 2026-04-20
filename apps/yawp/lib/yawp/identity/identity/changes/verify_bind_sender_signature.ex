defmodule Yawp.Identity.Identity.Changes.VerifyBindSenderSignature do
  @moduledoc """
  verifies the `sender_signature` over the canonical-JSON of
  the request body sans `sender_signature`. The signing key is the
  device subkey itself (`device_pk` argument decoded into context by
  `DecodeBindPayload`). Failure → `invalid_signature`.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    with %{device_pk_bytes: pk, sender_sig_bytes: sig}
         when is_binary(pk) and is_binary(sig) <- changeset.context,
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
    issued_at_iso =
      changeset
      |> Ash.Changeset.get_argument(:issued_at)
      |> DateTime.to_iso8601()

    Yawp.CanonicalJson.encode(%{
      "did" => changeset.data.did,
      "device_id" => Ash.Changeset.get_argument(changeset, :device_id),
      "device_pk" => Ash.Changeset.get_argument(changeset, :device_pk),
      "device_signature" => Ash.Changeset.get_argument(changeset, :device_signature),
      "issued_at" => issued_at_iso
    })
  end
end
