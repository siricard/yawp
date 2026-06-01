defmodule Yawp.Servers.Category.Reorder do
  @moduledoc """
  Implementation of the `:reorder` generic action on
  `Yawp.Servers.Category`. Assigns positions `0..n-1` to the categories
  named in `ordered_ids`, in order, within the given server.

  Gated by `manage_channels` (ADR 017, ADR 018) for non-nil actors.
  """
  use Ash.Resource.Actions.Implementation

  alias Yawp.Servers.Reorder

  @impl true
  def run(input, _opts, context) do
    Reorder.run(Yawp.Servers.Category, input.arguments, context)
  end
end
