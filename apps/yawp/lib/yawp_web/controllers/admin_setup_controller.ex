defmodule YawpWeb.AdminSetupController do
  @moduledoc """
  First-boot operator-account creation. Pre-LiveView surface
  intentionally a plain Phoenix controller so it works before any of
  the LiveView auth machinery is wired up.

  Two gates:

    * If any `Yawp.Admin.Account` exists, both GET and POST return 403.
    * The `token` query/body parameter is validated against the
      in-memory `Yawp.Admin.SetupToken` store on every request.

  On a successful POST, the operator account is created via
  `Yawp.Admin.create_account/2`, the setup token is invalidated, and
  the browser is redirected to `/admin`.

  ## Atomicity

  GET only previews the token (read-only). POST performs an atomic
  `SetupToken.consume/1` BEFORE calling `Admin.create_account/1`.
  `consume/1` is single-shot — the underlying Agent serializes all
  callers and only one ever observes the correct token, so even if N
  requests with the same valid token race the controller, at most
  one ever reaches account creation. (The Ash create action itself
  runs in its own DB transaction; we do not wrap it in an outer one,
  since the agent — not the DB — is the real serialization point.)

  If `create_account/1` then fails (e.g. validation), the setup token
  has already been consumed by the agent. This is a deliberate
  trade-off: consume wins eagerly; on failure the token stays
  consumed and the user sees the irrecoverable-failure page with
  restart instructions (HTTP 500). The operator must restart the
  server to mint a fresh setup token — we do not re-arm the agent
  on rollback. Acceptable because (a) the operator typed bad input,
  and (b) the server can be restarted to re-arm setup mode.
  """

  use YawpWeb, :controller

  alias Yawp.Admin
  alias Yawp.Admin.SetupToken

  plug :ensure_setup_mode

  def new(conn, params) do
    token = Map.get(params, "token", "")

    cond do
      SetupToken.valid?(token) ->
        render_form(conn, token, %{}, [])

      true ->
        render_forbidden(conn, :invalid_token)
    end
  end

  def create(conn, params) do
    token = Map.get(params, "token", "")

    attrs = %{
      email: Map.get(params, "email", ""),
      password: Map.get(params, "password", ""),
      password_confirmation: Map.get(params, "password_confirmation", "")
    }

    case consume_and_create(token, attrs) do
      {:ok, _account} ->
        conn
        |> put_flash(:info, "Operator account created. Welcome.")
        |> redirect(to: "/admin")

      {:error, :invalid_token} ->
        render_forbidden(conn, :invalid_token)

      {:error, {:create_account, error}} ->
                                        render_setup_failed(conn, error_messages(error))
    end
  end

          defp consume_and_create(token, attrs) do
    case SetupToken.consume(token) do
      {:ok, _token} ->
        case Admin.create_account(attrs) do
          {:ok, account} -> {:ok, account}
          {:error, error} -> {:error, {:create_account, error}}
        end

      {:error, :invalid} ->
        {:error, :invalid_token}
    end
  end

  defp ensure_setup_mode(conn, _opts) do
    if account_exists?() do
      conn
      |> render_forbidden(:setup_complete)
      |> halt()
    else
      conn
    end
  end

  defp account_exists? do
    Admin.Account
    |> Ash.Query.for_read(:read)
    |> Ash.count!(authorize?: false) > 0
  end

  defp render_form(conn, token, attrs, errors) do
    conn
    |> put_view(YawpWeb.AdminSetupHTML)
    |> render(:new,
      token: token,
      email: Map.get(attrs, :email, ""),
      errors: errors
    )
  end

  defp render_forbidden(conn, reason) do
    conn
    |> put_status(:forbidden)
    |> put_view(YawpWeb.AdminSetupHTML)
    |> render(:forbidden, reason: reason)
  end

  defp render_setup_failed(conn, errors) do
    conn
    |> put_status(:internal_server_error)
    |> put_view(YawpWeb.AdminSetupHTML)
    |> render(:setup_failed, errors: errors)
  end

  defp error_messages(%Ash.Error.Invalid{errors: errors}) do
    Enum.map(errors, &format_error/1)
  end

  defp error_messages(other), do: [inspect(other)]

  defp format_error(%{field: field, message: message}) when not is_nil(field) do
    "#{field}: #{message}"
  end

  defp format_error(%{message: message}) when is_binary(message), do: message
  defp format_error(other), do: inspect(other)
end
