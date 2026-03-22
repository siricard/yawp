defmodule YawpWeb.AuthController do
  use YawpWeb, :controller
  use AshAuthentication.Phoenix.Controller

  def success(conn, _activity, user, _token) do
                conn
    |> delete_session(:return_to)
    |> store_in_session(user)
    |> assign(:current_account, user)
    |> put_flash(:info, "You are now signed in")
    |> redirect(to: ~p"/admin")
  end

  def failure(conn, _activity, _reason) do
    conn
    |> put_flash(:error, "Incorrect email or password")
    |> redirect(to: ~p"/admin/login")
  end

  @doc """
  `/admin/logout` clears the session cookie and bounces the
  operator back to the login screen.
  """
  def logout(conn, _params) do
    conn
    |> clear_session(:yawp)
    |> put_flash(:info, "You are now signed out")
    |> redirect(to: ~p"/admin/login")
  end

        def sign_out(conn, params), do: logout(conn, params)
end
