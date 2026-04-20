defmodule Yawp.Identity.Identity.Changes.BumpProfileVersion do
  @moduledoc """
  bumps `profile_version` by 1 unless this was a re-bind of an
  already-bound device_id (in which case the version stays put).
  Reads `:already_bound?` from the changeset context stashed by
  `AppendDeviceSubkey`.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &apply/1)
  end

  defp apply(%{valid?: false} = changeset), do: changeset

  defp apply(changeset) do
    already_bound? = Map.get(changeset.context, :already_bound?, false)
    current = Ash.Changeset.get_attribute(changeset, :profile_version) || 0

    if already_bound? do
      changeset
    else
      Ash.Changeset.force_change_attribute(changeset, :profile_version, current + 1)
    end
  end
end
