defmodule Yawp.Servers.ReadMarker.Changes.VerifySignature do
  @moduledoc false

  use Ash.Resource.Change

  alias Yawp.Servers.Message.Signature

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    did = Ash.Changeset.get_argument(changeset, :identity_did)
    signed_by = Ash.Changeset.get_attribute(changeset, :signed_by)
    sig_b64 = Ash.Changeset.get_argument(changeset, :sender_signature)

    canonical =
      Yawp.CanonicalJson.encode(%{
        "channel_id" => Ash.Changeset.get_attribute(changeset, :channel_id),
        "identity_did" => did,
        "last_read_message_id" => Ash.Changeset.get_attribute(changeset, :last_read_message_id),
        "ts" => Ash.Changeset.get_argument(changeset, :ts)
      })

    with {:ok, _identity} <- Signature.verify(did, signed_by, sig_b64, canonical),
         {:ok, sig_bytes} <- Signature.decode_signature(sig_b64) do
      Ash.Changeset.force_change_attribute(changeset, :signature, sig_bytes)
    else
      _ -> Ash.Changeset.add_error(changeset, field: :signature, message: "invalid_signature")
    end
  end
end
