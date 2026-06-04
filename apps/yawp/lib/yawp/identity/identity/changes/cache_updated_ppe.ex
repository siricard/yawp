defmodule Yawp.Identity.Identity.Changes.CacheUpdatedPpe do
  use Ash.Resource.Change

  alias Yawp.Federation.InnerSignature
  alias Yawp.Identity
  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &cache/1)
  end

  defp cache(%{valid?: false} = changeset), do: changeset

  defp cache(changeset) do
    if Map.get(changeset.context, :anchor_appended?, false) do
      verify_and_cache(changeset)
    else
      changeset
    end
  end

  defp verify_and_cache(changeset) do
    ppe = Ash.Changeset.get_argument(changeset, :signed_ppe)
    new_anchor = Ash.Changeset.get_argument(changeset, :new_anchor)
    did = changeset.data.did
    current_version = changeset.data.profile_version || 0

    with true <- is_map(ppe),
         true <- ppe["did"] == did,
         version when is_integer(version) and version > current_version <-
           ppe["profile_version"],
         true <- is_list(ppe["anchors"]) and new_anchor in ppe["anchors"],
         :ok <- InnerSignature.verify(ppe, "did", "signature"),
         {:ok, :applied} <- Identity.apply_ppe_if_newer(ppe) do
      Ash.Changeset.force_change_attribute(changeset, :profile_version, version)
    else
      _ -> invalid_ppe(changeset)
    end
  end

  defp invalid_ppe(changeset) do
    Ash.Changeset.add_error(
      changeset,
      RpcError.exception(type: "invalid_ppe", message: "invalid_ppe")
    )
  end
end
