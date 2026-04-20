defmodule Yawp.Identity.Identity.Changes.WriteBindAudit do
  @moduledoc """
  `after_transaction` change that writes the
  `identity.bind_device` audit entry once the bind has committed.
  """
  use Ash.Resource.Change

  alias Yawp.Admin

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_transaction(changeset, &audit/2)
  end

  defp audit(_changeset, {:error, _} = err), do: err

  defp audit(changeset, {:ok, identity} = result) do
    device_id = Ash.Changeset.get_argument(changeset, :device_id)
    anchor_url = YawpWeb.Endpoint.url()

    _ =
      Admin.audit!(nil, "identity.bind_device", %{
        did: identity.did,
        device_id: device_id,
        anchor_url: anchor_url
      })

    result
  end
end
