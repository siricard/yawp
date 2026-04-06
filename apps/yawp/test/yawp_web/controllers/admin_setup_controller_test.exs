defmodule YawpWeb.AdminSetupControllerTest do
  @moduledoc """
  `/admin/setup` first-boot operator-creation endpoint.

  Pre-LiveView Phoenix controller. The setup token lives in a process-
  backed in-memory store (no DB persistence) and is destroyed on first
  successful account creation. Once any `Yawp.Admin.Account` exists,
  both GET and POST return 403.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Admin
  alias Yawp.Admin.SetupToken

  setup do
        SetupToken.reset()
    :ok
  end

  defp account_exists?(email) do
    require Ash.Query

    Yawp.Admin.Account
    |> Ash.Query.filter(email == ^email)
    |> Ash.exists?(authorize?: false)
  end

  describe "before any account exists" do
    test "GET /admin/setup with a valid token renders the form", %{conn: conn} do
      {:ok, token} = SetupToken.generate()
      conn = get(conn, "/admin/setup?token=#{token}")
      assert conn.status == 200
      assert conn.resp_body =~ ~s(id="admin-setup-form")
      assert conn.resp_body =~ ~s(name="email")
      assert conn.resp_body =~ ~s(name="password")
      assert conn.resp_body =~ ~s(name="password_confirmation")
      assert conn.resp_body =~ token
    end

    test "GET /admin/setup with no token renders the no-token error page", %{conn: conn} do
      {:ok, _token} = SetupToken.generate()
      conn = get(conn, "/admin/setup")
      assert conn.status == 403
      assert conn.resp_body =~ "Invalid or missing setup token"
    end

    test "GET /admin/setup with a bad token renders 403", %{conn: conn} do
      {:ok, _token} = SetupToken.generate()
      conn = get(conn, "/admin/setup?token=NOTVALID")
      assert conn.status == 403
      assert conn.resp_body =~ "Invalid or missing setup token"
    end

    test "POST /admin/setup with a valid token creates the account and redirects to /admin",
         %{conn: conn} do
      {:ok, token} = SetupToken.generate()

      conn =
        post(conn, "/admin/setup", %{
          "token" => token,
          "email" => "op@example.com",
          "password" => "correct horse battery staple",
          "password_confirmation" => "correct horse battery staple"
        })

      assert redirected_to(conn) == "/admin"
            assert account_exists?("op@example.com")
            assert SetupToken.current() == nil
    end

    test "POST /admin/setup with a bad token returns 403 and does NOT create an account",
         %{conn: conn} do
      {:ok, _token} = SetupToken.generate()

      conn =
        post(conn, "/admin/setup", %{
          "token" => "WRONG",
          "email" => "op@example.com",
          "password" => "correct horse battery staple",
          "password_confirmation" => "correct horse battery staple"
        })

      assert conn.status == 403
      refute account_exists?("op@example.com")
    end

    test "POST /admin/setup with mismatched password renders the irrecoverable setup-failed page; token IS consumed",
         %{conn: conn} do
      {:ok, token} = SetupToken.generate()

      conn =
        post(conn, "/admin/setup", %{
          "token" => token,
          "email" => "op@example.com",
          "password" => "correct horse battery staple",
          "password_confirmation" => "different"
        })

            assert conn.status == 500
      assert conn.resp_body =~ ~s(id="admin-setup-failed")

            assert conn.resp_body =~ ~r/restart the server/i

                  assert conn.resp_body =~ "password_confirmation"

            refute conn.resp_body =~ ~s(name="email")
      refute conn.resp_body =~ ~s(name="password")
      refute conn.resp_body =~ ~s(id="admin-setup-form")

                              assert SetupToken.current() == nil
    end
  end

  describe "after an account exists" do
    setup do
      {:ok, _account} =
        Admin.create_account(%{
          email: "first@example.com",
          password: "correct horse battery staple",
          password_confirmation: "correct horse battery staple"
        })

      :ok
    end

    test "GET /admin/setup returns 403 with setup-complete message", %{conn: conn} do
      conn = get(conn, "/admin/setup?token=anything")
      assert conn.status == 403
      assert conn.resp_body =~ "Setup already complete"
    end

    test "POST /admin/setup returns 403 and does not create another account", %{conn: conn} do
      conn =
        post(conn, "/admin/setup", %{
          "token" => "anything",
          "email" => "second@example.com",
          "password" => "correct horse battery staple",
          "password_confirmation" => "correct horse battery staple"
        })

      assert conn.status == 403
      assert conn.resp_body =~ "Setup already complete"
      refute account_exists?("second@example.com")
    end
  end

  describe "Yawp.Admin.SetupToken" do
    test "generate/0 returns a 128-bit base32 token (26 chars)" do
      {:ok, token} = SetupToken.generate()
      assert is_binary(token)
            assert String.length(token) == 26
      assert token =~ ~r/^[A-Z2-7]+$/
    end

    test "generate/0 is idempotent — second call returns the same token" do
      {:ok, token1} = SetupToken.generate()
      {:ok, token2} = SetupToken.generate()
      assert token1 == token2
    end

    test "valid?/1 returns true for the current token and false otherwise" do
      {:ok, token} = SetupToken.generate()
      assert SetupToken.valid?(token)
      refute SetupToken.valid?("nope")
      refute SetupToken.valid?(nil)
    end

    test "invalidate/0 clears the stored token" do
      {:ok, _token} = SetupToken.generate()
      :ok = SetupToken.invalidate()
      assert SetupToken.current() == nil
    end
  end
end
