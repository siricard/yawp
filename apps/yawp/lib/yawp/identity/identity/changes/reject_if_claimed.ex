defmodule Yawp.Identity.Identity.Changes.RejectIfClaimed do
  @moduledoc """
  Halts the chat-owner claim pipeline with `server_already_claimed`
  when an operator has already claimed this anchor (an Owner-role
  membership exists). Runs before the claim token is consumed so a
  late claim attempt never burns a valid token.

  The first-claim race is still safe: the guard only trips once an
  Owner membership has committed, and concurrent first claims are
  serialised by the claim-token consume step downstream.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &reject_if_claimed/1)
  end

  defp reject_if_claimed(%{valid?: false} = changeset), do: changeset

  defp reject_if_claimed(changeset) do
    if Yawp.Servers.SetupState.claimed?() do
      Ash.Changeset.add_error(
        changeset,
        RpcError.exception(type: "server_already_claimed", message: "server_already_claimed")
      )
    else
      changeset
    end
  end
end
