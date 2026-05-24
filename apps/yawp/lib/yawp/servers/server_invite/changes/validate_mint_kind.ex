defmodule Yawp.Servers.ServerInvite.Changes.ValidateMintKind do
  @moduledoc """
  fix(c) — enforces that `:multi_use` invites carry a positive
  `uses_remaining` cap. Per the validation contract:

    > Reusable invites (multi-use) are explicitly opt-in at mint time
    > and decrement a counter on each redemption.

  A counter implies a finite cap, so uncapped multi-use (`nil` or
  `<= 0`) is invalid.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &validate/1)
  end

  defp validate(changeset) do
    kind = Ash.Changeset.get_argument(changeset, :kind) || :single_use
    uses_remaining = Ash.Changeset.get_argument(changeset, :uses_remaining)

    case {kind, uses_remaining} do
      {:multi_use, nil} ->
        Ash.Changeset.add_error(
          changeset,
          Ash.Error.Changes.InvalidArgument.exception(
            field: :uses_remaining,
            message: "multi_use invites require a positive uses_remaining cap"
          )
        )

      {:multi_use, ur} when is_integer(ur) and ur < 1 ->
        Ash.Changeset.add_error(
          changeset,
          Ash.Error.Changes.InvalidArgument.exception(
            field: :uses_remaining,
            message: "uses_remaining must be a positive integer for multi_use invites"
          )
        )

      _ ->
        changeset
    end
  end
end
