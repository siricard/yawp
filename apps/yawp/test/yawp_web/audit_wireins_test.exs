defmodule YawpWeb.AuditWireinsTest do
  @moduledoc """
  verifies the operator audit log records the
  validation-contract events:

    * login.success / login.failure
    * logout
    *

  Also verifies the `/admin` dashboard's audit-log section renders the
  most-recent entries via a LiveView stream.
  """
  use YawpWeb.ConnCase, async: false

  import Phoenix.LiveViewTest
  require Ash.Query

  alias Yawp.Admin

  @password "correct horse battery staple"

  defp create_account!(email \\ "op@example.com") do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  defp recent_actions do
    {:ok, entries} = Admin.list_recent_audit_entries()
    Enum.map(entries, & &1.action)
  end

  defp test_conn do
    Phoenix.ConnTest.build_conn()
    |> Plug.Test.init_test_session(%{})
    |> Phoenix.ConnTest.fetch_flash()
  end

  defp with_token(account, token \\ "test-token") do
    Ash.Resource.put_metadata(account, :token, token)
  end

  describe "login wire-in via AuthController" do
    test "records login.success when AuthController.success/4 is invoked" do
      account = create_account!()

      _ =
        YawpWeb.AuthController.success(
          test_conn(),
          {:password, :sign_in},
          with_token(account),
          "tok"
        )

      assert "login.success" in recent_actions()
    end

    test "records login.failure when AuthController.failure/3 is invoked" do
      _ = YawpWeb.AuthController.failure(test_conn(), {:password, :sign_in}, :bad_password)

      assert "login.failure" in recent_actions()
    end
  end

  describe "logout wire-in" do
    test "records logout when /admin/logout is hit by a signed-in operator", %{conn: conn} do
      account = create_account!()

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> AshAuthentication.Plug.Helpers.store_in_session(with_token(account))

      _ = get(conn, "/admin/logout")

      assert "logout" in recent_actions()
    end
  end

  describe "audit-log stream on /admin" do
    test "renders the most-recent audit entries on mount", %{conn: conn} do
      account = create_account!()

      Admin.audit!(account.id, "login.success", %{ip: "127.0.0.1"})
      Admin.audit!(account.id, "settings.change", %{section: "attachment-backend"})

      {:ok, account_for_sign_in} =
        Yawp.Admin.Account
        |> Ash.Query.for_read(:sign_in_with_password, %{
          email: "op@example.com",
          password: @password
        })
        |> Ash.read_one(authorize?: false)

      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> AshAuthentication.Plug.Helpers.store_in_session(account_for_sign_in)

      {:ok, view, _html} = live(conn, "/admin")

      html = render(view)
      assert html =~ "login.success"
      assert html =~ "settings.change"
      refute has_element?(view, "#audit-log-empty:not(.hidden)")
    end
  end
end
