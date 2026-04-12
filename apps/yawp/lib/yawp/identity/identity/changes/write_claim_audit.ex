defmodule Yawp.Identity.Identity.Changes.WriteClaimAudit do
  @moduledoc """
  `after_transaction` change that records the
  `claim_token.consume` audit entry once the parent transaction has
  committed. Audits should reflect committed state, so this runs OUTSIDE
  the action's transaction.
  """
  use Ash.Resource.Change

  alias Yawp.Admin

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_transaction(changeset, &audit/2)
  end

  defp audit(_changeset, {:error, _} = err), do: err

  defp audit(changeset, {:ok, identity} = result) do
    case Map.get(changeset.context, :consumed_claim_token) do
      nil ->
        result

      %Admin.ClaimToken{} = claim ->
        _ =
          Admin.audit!(nil, "claim_token.consume", %{
            token_id: claim.id,
            did: identity.did,
            identity_id: identity.id
          })

        result
    end
  end
end
