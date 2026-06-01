defmodule Yawp.Servers.MessageTombstone.Changes.VerifyDeleteSignature do
  @moduledoc """
  Verifies the actor's device-subkey signature over the canonical-JSON
  delete envelope `{message_id, reason, actor_did, ts}`, then stores the
  raw signature on `:signature` and stashes the resolved actor identity
  and target message in changeset context for the downstream authorize
  and wipe changes.
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
    reason = Ash.Changeset.get_attribute(changeset, :reason)
    actor_did = Ash.Changeset.get_attribute(changeset, :actor_did)
    signed_by = Ash.Changeset.get_attribute(changeset, :signed_by)
    sig_b64 = Ash.Changeset.get_argument(changeset, :signature)
    ts = Ash.Changeset.get_argument(changeset, :ts)

    canonical =
      Yawp.CanonicalJson.encode(%{
        "message_id" => message_id,
        "reason" => to_string(reason),
        "actor_did" => actor_did,
        "ts" => ts
      })

    with {:ok, message} <- fetch_message(message_id),
         {:ok, identity} <- Signature.verify(actor_did, signed_by, sig_b64, canonical),
         {:ok, sig_bytes} <- Signature.decode_signature(sig_b64) do
      changeset
      |> Ash.Changeset.force_change_attribute(:signature, sig_bytes)
      |> Ash.Changeset.set_context(%{actor_identity: identity, target_message: message})
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
end
