defmodule Yawp.Servers.MessageEdit.Changes.VerifyEditSignature do
  @moduledoc """
  Verifies that an edit was signed by the original sender's device
  subkey over the canonical-JSON envelope `{message_id, body, ts}`, then
  stores the raw 64-byte signature on `:sender_signature`.

  The author DID is resolved from the parent message, not from the
  request, so an edit can only ever be authored by the original sender.
  """
  use Ash.Resource.Change

  alias Yawp.Servers.Message.Signature

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    message_id = Ash.Changeset.get_attribute(changeset, :message_id)
    body = Ash.Changeset.get_attribute(changeset, :body)
    signed_by = Ash.Changeset.get_attribute(changeset, :signed_by)
    sig_b64 = Ash.Changeset.get_argument(changeset, :signature)
    ts = Ash.Changeset.get_argument(changeset, :ts)

    with {:ok, message} <- fetch_message(message_id),
         canonical <- build_canonical(message_id, body, ts),
         {:ok, _identity} <- Signature.verify(message.sender_did, signed_by, sig_b64, canonical),
         {:ok, sig_bytes} <- Signature.decode_signature(sig_b64) do
      Ash.Changeset.force_change_attribute(changeset, :sender_signature, sig_bytes)
    else
      _ -> Ash.Changeset.add_error(changeset, field: :signature, message: "invalid_signature")
    end
  end

  defp fetch_message(nil), do: :error

  defp fetch_message(message_id) do
    case Ash.get(Yawp.Servers.Message, message_id, authorize?: false) do
      {:ok, message} -> {:ok, message}
      _ -> :error
    end
  end

  defp build_canonical(message_id, body, ts) do
    Yawp.CanonicalJson.encode(%{"message_id" => message_id, "body" => body, "ts" => ts})
  end
end
