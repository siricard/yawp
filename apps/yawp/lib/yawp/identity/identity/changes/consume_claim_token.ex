defmodule Yawp.Identity.Identity.Changes.ConsumeClaimToken do
  @moduledoc """
  consumes the claim token associated with this
  claim request inside the action's transaction. On any failure adds a
  typed RPC error (`claim_token_invalid | claim_token_consumed |
  claim_token_revoked | claim_token_expired`) and halts the pipeline.

  Stashes the consumed `Yawp.Admin.ClaimToken` on the changeset context
  under `:consumed_claim_token` so `WriteClaimAudit` can record the
  token id after commit.
  """
  use Ash.Resource.Change

  alias Yawp.Admin
  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &consume/1)
  end

  defp consume(%{valid?: false} = changeset), do: changeset

  defp consume(changeset) do
    token = Ash.Changeset.get_argument(changeset, :claim_token)

    case Admin.consume_claim_token(token, return_notifications?: true) do
      {:ok, claim, notifications} ->
        changeset
        |> Ash.Changeset.put_context(:consumed_claim_token, claim)
        |> Ash.Changeset.put_context(:consume_notifications, notifications)

      {:ok, claim} ->
        Ash.Changeset.put_context(changeset, :consumed_claim_token, claim)

      {:error, slug} when is_atom(slug) ->
        type = classify(token, slug)

        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: Atom.to_string(type), message: Atom.to_string(type))
        )
    end
  end

  defp classify(_token, :claim_token_consumed), do: :claim_token_consumed
  defp classify(_token, :claim_token_expired), do: :claim_token_expired

  defp classify(token, :claim_token_invalid) do
    case Admin.get_claim_token_by_token(token) do
      {:ok, %Admin.ClaimToken{revoked_at: revoked_at}} when not is_nil(revoked_at) ->
        :claim_token_revoked

      _ ->
        :claim_token_invalid
    end
  end

  defp classify(_token, other), do: other
end
