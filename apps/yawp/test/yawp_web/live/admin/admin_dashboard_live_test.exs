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

  describe "chat-owner-management claim-token UI" do
    setup ctx, do: sign_in!(ctx)

    test "renders the Generate claim token button when no active token", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#claim-token-generate-btn")
      refute has_element?(view, "#claim-token-revoke-btn")
    end

    test "clicking Generate renders the token + Replace + Revoke controls", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")

      view
      |> element("#claim-token-generate-btn")
      |> render_click()

      {:ok, token} = Yawp.Admin.get_active_claim_token()
      assert token
      assert has_element?(view, "#claim-token-value", token.token)
      assert has_element?(view, "#claim-token-replace-btn")
      assert has_element?(view, "#claim-token-revoke-btn")
      refute has_element?(view, "#claim-token-generate-btn")
    end

    test "clicking Replace mints a fresh token and revokes the prior one", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")

      view |> element("#claim-token-generate-btn") |> render_click()
      {:ok, first} = Yawp.Admin.get_active_claim_token()

      view |> element("#claim-token-replace-btn") |> render_click()
      {:ok, second} = Yawp.Admin.get_active_claim_token()

      assert second
      assert second.token != first.token
      assert DateTime.compare(second.expires_at, first.expires_at) in [:gt, :eq]
      assert has_element?(view, "#claim-token-value", second.token)
      refute has_element?(view, "#claim-token-value", first.token)

      {:ok, entries} = Yawp.Admin.list_recent_audit_entries()
      actions = Enum.map(entries, & &1.action)
      assert "claim_token.revoke" in actions
            assert Enum.count(actions, &(&1 == "claim_token.generate")) >= 2
    end

    test "Generate writes a claim_token.generate audit entry", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")

      view
      |> element("#claim-token-generate-btn")
      |> render_click()

      {:ok, entries} = Yawp.Admin.list_recent_audit_entries()
      actions = Enum.map(entries, & &1.action)
      assert "claim_token.generate" in actions
    end

    test "Revoke clears the active token and writes a claim_token.revoke audit entry",
         %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")

      view
      |> element("#claim-token-generate-btn")
      |> render_click()

      view
      |> element("#claim-token-revoke-btn")
      |> render_click()

      assert has_element?(view, "#claim-token-generate-btn")
      refute has_element?(view, "#claim-token-revoke-btn")

      {:ok, entries} = Yawp.Admin.list_recent_audit_entries()
      actions = Enum.map(entries, & &1.action)
      assert "claim_token.revoke" in actions
    end
  end

  describe "chat-owner rendering" do
    setup ctx, do: sign_in!(ctx)

    test "shows 'No chat owner yet' when no Identity row exists", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      refute has_element?(view, "#chat-owner-did")
      assert render(view) =~ "No chat owner yet"
    end

    test "renders the truncated DID at #chat-owner-did when claimed", %{conn: conn} do
      {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
      did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
      _identity = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#chat-owner-did")
            assert render(view) =~ String.slice(did, 0, 16)
    end
  end

  describe "server-invites section" do
    setup ctx, do: sign_in!(ctx)

    setup do
      :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "section renders with mint button and disables it when no chat owner",
         %{conn: conn} do
      {:ok, view, _html} = live(conn, "/admin")
      assert has_element?(view, "#section-server-invites")
      assert has_element?(view, "#server-invite-mint-btn[disabled]")
    end

    test "mint button enabled when chat owner exists; clicking mints + lists invite",
         %{conn: conn} do
      {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
      did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
      _identity = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

      {:ok, view, _html} = live(conn, "/admin")
      refute has_element?(view, "#server-invite-mint-btn[disabled]")

      view |> element("#server-invite-mint-btn") |> render_click()

      {:ok, server} = Yawp.Servers.get_singleton_server()
      {:ok, [invite | _]} = Yawp.Servers.list_active_server_invites(server.id)

      assert has_element?(view, "#server-invite-token-#{invite.id}", invite.token)
      assert has_element?(view, "#server-invite-revoke-btn-#{invite.id}")
    end

    test "revoke button removes the invite from the list", %{conn: conn} do
      {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
      did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
      _identity = Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})

      {:ok, view, _html} = live(conn, "/admin")
      view |> element("#server-invite-mint-btn") |> render_click()

      {:ok, server} = Yawp.Servers.get_singleton_server()
      {:ok, [invite | _]} = Yawp.Servers.list_active_server_invites(server.id)

      view
      |> element("#server-invite-revoke-btn-#{invite.id}")
      |> render_click()

      {:ok, reread} = Yawp.Servers.get_server_invite_by_id(invite.id)
      assert reread.revoked_at != nil
      refute has_element?(view, "#server-invite-token-#{invite.id}")
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
