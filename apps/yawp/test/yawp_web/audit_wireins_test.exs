defmodule YawpWeb.AuditWireinsTest do
  @moduledoc """
  verifies the operator audit log records the
  validation-contract events:

    * login.success / login.failure
    * logout
    * claim_token.generate / claim_token.revoke (dashboard wire-in)
    * claim_token.consume (claim controller wire-in)
    * settings.change (dashboard wire-in)

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

  defp signed_in_live_conn(conn) do
    _account = create_account!()

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

    {conn, account_for_sign_in}
  end

  describe "claim-token wire-ins on /admin" do
    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "generate_claim_token writes claim_token.generate audit entry", %{conn: conn} do
      {conn, _account} = signed_in_live_conn(conn)
      {:ok, view, _html} = live(conn, "/admin")

      _ =
        view
        |> element("#claim-token-generate-btn")
        |> render_click()

      {:ok, entries} = Admin.list_recent_audit_entries()
      generate = Enum.find(entries, &(&1.action == "claim_token.generate"))
      assert generate
      assert is_map(generate.payload)
      assert Map.get(generate.payload, "token_id") || Map.get(generate.payload, :token_id)
    end

    test "revoke_claim_token writes claim_token.revoke audit entry", %{conn: conn} do
      {conn, _account} = signed_in_live_conn(conn)
      {:ok, view, _html} = live(conn, "/admin")

      _ = view |> element("#claim-token-generate-btn") |> render_click()
      _ = view |> element("#claim-token-revoke-btn") |> render_click()

      {:ok, entries} = Admin.list_recent_audit_entries()
      revoke = Enum.find(entries, &(&1.action == "claim_token.revoke"))
      assert revoke
      assert is_map(revoke.payload)
      assert Map.get(revoke.payload, "token_id") || Map.get(revoke.payload, :token_id)
    end
  end

  describe "claim controller wire-in" do
    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "POST /api/claim writes claim_token.consume on success", %{conn: conn} do
      {:ok, account} =
        Admin.create_account(%{
          email: "op2@example.com",
          password: @password,
          password_confirmation: @password
        })

      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
      did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
      pk_b64 = Base.url_encode64(pk, padding: false)

      canonical =
        Yawp.CanonicalJson.encode(%{
          "claim_token" => claim.token,
          "did" => did,
          "pk" => pk_b64
        })

      sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])

      body = %{
        "claim_token" => claim.token,
        "did" => did,
        "pk" => pk_b64,
        "sender_signature" => Base.url_encode64(sig, padding: false)
      }

      conn = post(conn, "/api/claim", body)
      assert %{"did" => ^did} = json_response(conn, 200)

      {:ok, entries} = Admin.list_recent_audit_entries()
      consume = Enum.find(entries, &(&1.action == "claim_token.consume"))
      assert consume
      payload = consume.payload
      assert Map.get(payload, "token_id") || Map.get(payload, :token_id)
      assert Map.get(payload, "did") == did or Map.get(payload, :did) == did
    end
  end

  describe "settings.change wire-in on /admin" do
    test "acknowledging per-server defaults writes settings.change audit entry", %{conn: conn} do
      {conn, _account} = signed_in_live_conn(conn)
      {:ok, view, _html} = live(conn, "/admin")

      _ =
        view
        |> element("#per-server-defaults-acknowledge-btn")
        |> render_click()

      {:ok, entries} = Admin.list_recent_audit_entries()
      change = Enum.find(entries, &(&1.action == "settings.change"))
      assert change
      payload = change.payload

      assert Map.get(payload, "section") == "per-server-defaults" or
               Map.get(payload, :section) == "per-server-defaults"
    end
  end

  describe "audit-log stream on /admin" do
    test "renders the most-recent audit entries on mount", %{conn: conn} do
      {conn, account} = signed_in_live_conn(conn)
      Admin.audit!(account.id, "login.success", %{ip: "127.0.0.1"})

      {:ok, view, _html} = live(conn, "/admin")

      html = render(view)
      assert html =~ "login.success"
      refute has_element?(view, "#audit-log-empty:not(.hidden)")
    end
  end
end
