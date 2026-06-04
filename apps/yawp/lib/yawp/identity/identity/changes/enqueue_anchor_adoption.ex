defmodule Yawp.Identity.Identity.Changes.EnqueueAnchorAdoption do
  use Ash.Resource.Change

  alias Yawp.Federation.AnchorAdoptionWorker

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, &enqueue/2)
  end

  defp enqueue(changeset, identity) do
    if Map.get(changeset.context, :anchor_appended?, false) do
      new_anchor = Ash.Changeset.get_argument(changeset, :new_anchor)

      %{"did" => identity.did, "new_anchor" => new_anchor}
      |> AnchorAdoptionWorker.new()
      |> Oban.insert()
      |> case do
        {:ok, _job} -> {:ok, identity}
        {:error, reason} -> {:error, reason}
      end
    else
      {:ok, identity}
    end
  end
end
