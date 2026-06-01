defmodule Yawp.Servers.Changes.EnforceCategoryDepth do
  @moduledoc """
  Rejects a category whose `parent_id` points at a category that itself
  already has a parent. v1 caps category nesting at one level (ADR 018);
  the database carries the self-reference so deeper nesting can be
  enabled later, but the depth invariant lives here.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    case Ash.Changeset.get_attribute(changeset, :parent_id) do
      nil ->
        changeset

      parent_id ->
        case Ash.get(Yawp.Servers.Category, parent_id, authorize?: false) do
          {:ok, %{parent_id: nil}} ->
            changeset

          {:ok, _nested_parent} ->
            Ash.Changeset.add_error(changeset,
              field: :parent_id,
              message: "category nesting is limited to one level"
            )

          _ ->
            Ash.Changeset.add_error(changeset,
              field: :parent_id,
              message: "parent category not found"
            )
        end
    end
  end
end
