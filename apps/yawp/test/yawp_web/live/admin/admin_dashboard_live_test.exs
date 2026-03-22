defmodule YawpWeb.AdminDashboardLiveTest do
  @moduledoc """
  `/admin` operator-panel LiveView.

  Validates the auth gate and that the dashboard renders every
  section enumerated in / validation contract . Sections
  beyond the bare-minimum chat-owner management view are stubbed in
  this feature; they are nonetheless required to render so downstream
  features can graft their UI in.
  """
  use YawpWeb.ConnCase, async: false

  import Phoenix.LiveViewTest
  require Ash.Query

  alias Yawp.Admin

  @password "correct horse battery staple"

  defp create_account!(email) do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  defp sign_in!(%{conn: conn}, email \\ "op@example.com") do
    _ = create_account!(email)

    {:ok, account} =
      Yawp.Admin.Account
      |> Ash.Query.for_read(:sign_in_with_password, %{email: email, password: @password})
      |> Ash.read_one(authorize?: false)

    conn =
      conn
      |> Plug.Test.init_test_session(%{})
      |> AshAuthentication.Plug.Helpers.store_in_session(account)

    %{conn: conn, account: account}
  end

  describe "auth gate" do
    test "unauthenticated GET /admin redirects to /admin/login", %{conn: conn} do
      assert {:error, {:redirect, %{to: "/admin/login"}}} = live(conn, "/admin")
    end
  end

  describe "authenticated dashboard" do
    setup ctx, do: sign_in!(ctx)

    test "renders every section heading", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")

      for section <- ~w(
            attachment-backend
            turn-coturn
            per-server-defaults
            body-archive
            federation-status
            key-rotation
            database-health
            chat-owner-management
            operator-audit-log
          ) do
        assert has_element?(view, "#section-#{section}"),
               "expected #section-#{section} to render on /admin"
      end
    end

    test "shows the signed-in operator email", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#operator-email", "op@example.com")
    end

    test "exposes a logout link to /admin/logout", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, ~s(a[href="/admin/logout"]))
    end

    test "federation-status section shows the active server key id", %{conn: conn} do
      {:ok, key} = Yawp.Federation.generate_server_key()

      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#federation-status", key.key_id)
    end

    test "operator-audit-log section renders an empty-state when no entries", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#section-operator-audit-log #audit-log-empty")
    end
  end

  describe "/admin/logout" do
    setup ctx, do: sign_in!(ctx)

    test "clears the session and redirects to /admin/login", %{conn: conn} do
      conn = get(conn, "/admin/logout")
      assert redirected_to(conn) == "/admin/login"
            assert {:error, {:redirect, %{to: "/admin/login"}}} = live(recycle(conn), "/admin")
    end
  end
end
