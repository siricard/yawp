defmodule YawpWeb.AuthController do
  use YawpWeb, :controller
  use AshAuthentication.Phoenix.Controller

  def success(conn, _activity, user, token) do
                _ = Yawp.Admin.audit!(user.id, "login.success", %{email: to_string(user.email)})

    user_with_token = Ash.Resource.put_metadata(user, :token, token)

    conn
    |> delete_session(:return_to)
    |> store_in_session(user_with_token)
    |> assign(:current_account, user_with_token)
    |> put_flash(:info, "You are now signed in")
    |> redirect(to: ~p"/admin")
  end

  def failure(conn, _activity, reason) do
    _ = Yawp.Admin.audit!(nil, "login.failure", %{reason: inspect(reason)})

    conn
    |> put_flash(:error, "Incorrect email or password")
    |> redirect(to: ~p"/admin/login")
  end

  @doc """
  `/admin/logout` clears the session cookie and bounces the
  operator back to the login screen.
  """
  def logout(conn, _params) do
    account_id =
      case conn.assigns[:current_account] do
        %{id: id} -> id
        _ -> nil
      end

    _ = Yawp.Admin.audit!(account_id, "logout", %{})

    conn
    |> clear_session(:yawp)
    |> put_flash(:info, "You are now signed out")
    |> redirect(to: ~p"/admin/login")
  end

        def sign_out(conn, params), do: logout(conn, params)
end
