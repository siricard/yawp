defmodule Yawp.Identity.Identity.Changes.VerifyDeviceDelegation do
  @moduledoc """
  verifies the master-key delegation signature
  (`device_signature`) over canonical-JSON of
  `%{device_id, pk, issued_at}` against the Identity's
  `master_public_key`. Failure → `invalid_device_delegation`.

   only supports master-signed delegations extends to walk
  the device chain.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &verify/1)
  end

  defp verify(%{valid?: false} = changeset), do: changeset

  defp verify(changeset) do
    master_pk = Ash.Changeset.get_attribute(changeset, :master_public_key)
    device_sig = Map.get(changeset.context, :device_sig_bytes)
    device_pk_b64 = Ash.Changeset.get_argument(changeset, :device_pk)
    device_id = Ash.Changeset.get_argument(changeset, :device_id)

                canonical =
      Yawp.CanonicalJson.encode(%{
        "device_id" => device_id,
        "pk" => device_pk_b64,
        "issued_at" => Ash.Changeset.get_argument(changeset, :device_issued_at)
      })

    with true <- is_binary(master_pk) and is_binary(device_sig),
         true <- :crypto.verify(:eddsa, :none, canonical, device_sig, [master_pk, :ed25519]) do
      changeset
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(
            type: "invalid_device_delegation",
            message: "invalid_device_delegation"
          )
        )
    end
  end
end
