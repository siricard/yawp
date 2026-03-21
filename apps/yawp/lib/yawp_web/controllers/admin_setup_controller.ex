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

    if SetupToken.valid?(token) do
      attrs = %{
        email: Map.get(params, "email", ""),
        password: Map.get(params, "password", ""),
        password_confirmation: Map.get(params, "password_confirmation", "")
      }

      case Admin.create_account(attrs) do
        {:ok, _account} ->
          :ok = SetupToken.invalidate()

          conn
          |> put_flash(:info, "Operator account created. Welcome.")
          |> redirect(to: "/admin")

        {:error, error} ->
          render_form(conn, token, attrs, error_messages(error))
      end
    else
      render_forbidden(conn, :invalid_token)
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
