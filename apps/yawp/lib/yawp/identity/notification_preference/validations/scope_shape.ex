defmodule Yawp.Identity.NotificationPreference.Validations.ScopeShape do
  @moduledoc false

  use Ash.Resource.Validation

  @impl true
  def init(opts), do: {:ok, opts}

  @impl true
  def validate(changeset, _opts, _context) do
    scope_count =
      [:server_id, :channel_id, :conversation_id]
      |> Enum.count(&(not is_nil(Ash.Changeset.get_attribute(changeset, &1))))

    if scope_count <= 1 do
      :ok
    else
      {:error, message: "exactly one notification scope may be set"}
    end
  end
end
