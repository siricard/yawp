defmodule Yawp.Identity.Identity.Changes.AppendAnchorUrl do
  @moduledoc """
  idempotent append on `anchor_list`. Uses
  `YawpWeb.Endpoint.url/0` — the server knows its own URL; the anchor
  URL is NEVER trusted from the client request.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &apply/1)
  end

  defp apply(%{valid?: false} = changeset), do: changeset

  defp apply(changeset) do
    anchor_url = YawpWeb.Endpoint.url()
    anchors = Ash.Changeset.get_attribute(changeset, :anchor_list) || []

    new_anchors =
      if anchor_url in anchors, do: anchors, else: anchors ++ [anchor_url]

    Ash.Changeset.force_change_attribute(changeset, :anchor_list, new_anchors)
  end
end
