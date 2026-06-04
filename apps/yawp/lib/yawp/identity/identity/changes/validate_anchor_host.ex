defmodule Yawp.Identity.Identity.Changes.ValidateAnchorHost do
  use Ash.Resource.Change

  alias Yawp.RpcError

  @host_regex ~r/^[a-zA-Z0-9.-]+(:\d+)?$/

  @impl true
  def change(changeset, _opts, _context) do
    new_anchor = Ash.Changeset.get_argument(changeset, :new_anchor)

    if is_binary(new_anchor) and Regex.match?(@host_regex, new_anchor) do
      changeset
    else
      Ash.Changeset.add_error(
        changeset,
        RpcError.exception(type: "invalid_anchor", message: "invalid_anchor")
      )
    end
  end
end
