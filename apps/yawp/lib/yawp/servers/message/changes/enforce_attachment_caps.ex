defmodule Yawp.Servers.Message.Changes.EnforceAttachmentCaps do
  @moduledoc false

  use Ash.Resource.Change

  @default_max_attachments_per_message 10

  @impl true
  def change(changeset, _opts, _context) do
    attachments = Ash.Changeset.get_attribute(changeset, :attachments) || []
    max = max_attachments_per_message()

    if length(attachments) <= max do
      changeset
    else
      Ash.Changeset.add_error(changeset,
        field: :attachments,
        message: "too_many_attachments",
        vars: [max_attachments_per_message: max]
      )
    end
  end

  defp max_attachments_per_message do
    Application.get_env(:yawp, :attachments, [])
    |> Keyword.get(:max_attachments_per_message, @default_max_attachments_per_message)
  end
end
