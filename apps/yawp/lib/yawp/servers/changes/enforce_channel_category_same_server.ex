defmodule Yawp.Servers.Changes.EnforceChannelCategorySameServer do
  @moduledoc """
  Rejects a channel whose `category_id` points at a category on a
  different server. The channel's server is read from the changeset's
  `server_id` attribute (on create) or the underlying record (on
  recategorize); a `nil` `category_id` is always allowed.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    case Ash.Changeset.get_attribute(changeset, :category_id) do
      nil ->
        changeset

      category_id ->
        server_id =
          Ash.Changeset.get_attribute(changeset, :server_id) || record_server_id(changeset)

        case Ash.get(Yawp.Servers.Category, category_id, authorize?: false) do
          {:ok, %{server_id: ^server_id}} ->
            changeset

          {:ok, _other_server} ->
            Ash.Changeset.add_error(changeset,
              field: :category_id,
              message: "category belongs to a different server"
            )

          _ ->
            Ash.Changeset.add_error(changeset,
              field: :category_id,
              message: "category not found"
            )
        end
    end
  end

  defp record_server_id(%{data: %{server_id: server_id}}) when is_binary(server_id),
    do: server_id

  defp record_server_id(_), do: nil
end
