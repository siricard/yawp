defmodule Yawp.Servers.Message.Changes.VerifySendSignature do
  @moduledoc """
  Verifies the ed25519 signature on a `Yawp.Servers.Message.:send`
  changeset over the canonical-JSON envelope, then swaps the base64url
  signature argument for the raw 64 bytes stored on `:sender_signature`.
  """
  use Ash.Resource.Change

  alias Yawp.Servers.Message.Signature

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    did = Ash.Changeset.get_attribute(changeset, :sender_did)
    signed_by = Ash.Changeset.get_attribute(changeset, :signed_by)
    sig_b64 = Ash.Changeset.get_argument(changeset, :signature)

    canonical =
      Yawp.CanonicalJson.encode(%{
        "channel_id" => Ash.Changeset.get_attribute(changeset, :channel_id),
        "sender_did" => did,
        "body" => Ash.Changeset.get_attribute(changeset, :body),
        "reply_to_message_id" => Ash.Changeset.get_attribute(changeset, :reply_to_message_id),
        "mentions" => Ash.Changeset.get_attribute(changeset, :mentions) || [],
        "attachments" => Ash.Changeset.get_attribute(changeset, :attachments) || [],
        "ts" => Ash.Changeset.get_argument(changeset, :ts)
      })

    with {:ok, _identity} <- Signature.verify(did, signed_by, sig_b64, canonical),
         {:ok, sig_bytes} <- Signature.decode_signature(sig_b64) do
      Ash.Changeset.force_change_attribute(changeset, :sender_signature, sig_bytes)
    else
      _ -> Ash.Changeset.add_error(changeset, field: :signature, message: "invalid_signature")
    end
  end
end
