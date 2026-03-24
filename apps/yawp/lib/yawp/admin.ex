defmodule Yawp.Admin do
  @moduledoc """
  The operator/admin domain — accounts that hold a password (or passkey
  in a later milestone), claim tokens, audit log, and per-server
  settings. See `docs/` for the
  operator-vs-chat-owner split.

   only hosts the renamed `Yawp.Admin.Account` and `Yawp.Admin.Token`
  (renamed from the legacy Accounts namespace). Claim tokens and the audit
  log resource land .
  """

  use Ash.Domain, otp_app: :yawp, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Yawp.Admin.Account
  end

  resources do
    resource Yawp.Admin.Token

    resource Yawp.Admin.Account do
      define :create_account, action: :create_account
      define :touch_last_login, action: :touch_last_login
      define :get_admin_account_by_email, action: :get_by_email, args: [:email]
    end

    resource Yawp.Admin.AuditLogEntry do
      define :create_audit_entry, action: :create
      define :list_recent_audit_entries, action: :list_recent
    end

    resource Yawp.Admin.ClaimToken do
      define :generate_claim_token, action: :generate
      define :revoke_claim_token, action: :revoke
      define :get_active_claim_token, action: :get_active, not_found_error?: false

      define :get_claim_token_by_token,
        action: :get_by_token,
        args: [:token],
        not_found_error?: false

      define :get_claim_token_by_id, action: :get_by_id, args: [:id]
    end
  end

  @doc """
  Records an operator audit-log event.

  `account_id` may be `nil` when the action has no authenticated
  operator (e.g. a failed login attempt). `payload` is stored as
  JSONB and round-trips through Postgres with string keys.

  Raises if the insert fails — audit events must be recorded.
  """
  @spec audit!(binary() | nil, String.t(), map()) :: Yawp.Admin.AuditLogEntry.t()
  def audit!(account_id, action, payload \\ %{})
      when (is_binary(account_id) or is_nil(account_id)) and is_binary(action) and is_map(payload) do
    create_audit_entry!(%{account_id: account_id, action: action, payload: payload},
      authorize?: false
    )
  end

  @doc """
  Validates and consumes a claim token.

  Returns `{:ok, claim_token}` on success, or one of
  `{:error, :claim_token_invalid | :claim_token_consumed | :claim_token_expired}`
  using vocabulary. calls this from the
  `POST /api/claim` controller; the action is defined here so the
  resource boundary owns the state validation.
  """
  @spec consume_claim_token(String.t()) ::
          {:ok, Yawp.Admin.ClaimToken.t()}
          | {:error, :claim_token_invalid | :claim_token_consumed | :claim_token_expired}
  def consume_claim_token(token) when is_binary(token) do
    case get_claim_token_by_token(token) do
      {:ok, %Yawp.Admin.ClaimToken{} = claim} ->
        cond do
          claim.consumed_at != nil ->
            {:error, :claim_token_consumed}

          claim.revoked_at != nil ->
            {:error, :claim_token_invalid}

          DateTime.compare(claim.expires_at, DateTime.utc_now()) != :gt ->
            {:error, :claim_token_expired}

          true ->
            {:ok, consumed} =
              claim
              |> Ash.Changeset.for_update(:consume, %{})
              |> Ash.update(authorize?: false)

            {:ok, consumed}
        end

      {:error, _} ->
        {:error, :claim_token_invalid}

      {:ok, nil} ->
        {:error, :claim_token_invalid}
    end
  end
end
