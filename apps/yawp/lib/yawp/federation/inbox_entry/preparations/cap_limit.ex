defmodule Yawp.Federation.InboxEntry.Preparations.CapLimit do
  @moduledoc """
  Caps the `pull` action's page size at 1000 envelopes regardless of
  the requested `limit`, per the anchor-sync pagination ceiling.
  """
  use Ash.Resource.Preparation

  @max_limit 1000

  @impl true
  def prepare(query, _opts, _context) do
    requested = Ash.Query.get_argument(query, :limit) || @max_limit
    Ash.Query.limit(query, min(requested, @max_limit))
  end
end
