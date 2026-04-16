defmodule YawpWeb.Plugs.ChatSessionTest do
  @moduledoc """
  `Yawp.Plug.ChatSession` reads `Authorization: Bearer <token>`,
  calls `Yawp.Identity.verify_session/1`, and either assigns
  `:current_identity` + sets the Ash actor (pass-through mode) or halts
  with 401 (gate mode).
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Identity

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Yawp.Identity.Identity, %{did: did, master_public_key: pk})
  end

  defp issue!(identity) do
    device_id = Ecto.UUID.generate()
    {:ok, %{session_token: session}} = Identity.issue_pair(identity.id, device_id)
    session
  end

  defp call(conn, opts \\ []) do
    Yawp.Plug.ChatSession.call(conn, Yawp.Plug.ChatSession.init(opts))
  end

  describe "pass-through mode (default)" do
    test "assigns :current_identity for a valid Bearer token" do
      identity = seed_identity!()
      session = issue!(identity)

      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer " <> session.token)
        |> call()

      assert conn.assigns[:current_identity].id == identity.id
      assert Ash.PlugHelpers.get_actor(conn).id == identity.id
      refute conn.halted
    end

    test "passes through (no assign, not halted) when Authorization header is missing" do
      conn = Phoenix.ConnTest.build_conn() |> call()
      refute conn.halted
      assert conn.assigns[:current_identity] == nil
      assert Ash.PlugHelpers.get_actor(conn) == nil
    end

    test "passes through when token is malformed" do
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer not-a-real-token")
        |> call()

      refute conn.halted
      assert conn.assigns[:current_identity] == nil
    end

    test "passes through when token is expired" do
      identity = seed_identity!()
      session = issue!(identity)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)
      import Ecto.Query

      Yawp.Repo.update_all(
        from(s in "identity_session_tokens",
          where: s.id == type(^session.id, Ecto.UUID)
        ),
        set: [expires_at: past]
      )

      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer " <> session.token)
        |> call()

      refute conn.halted
      assert conn.assigns[:current_identity] == nil
    end

    test "passes through when token is revoked" do
      identity = seed_identity!()
      session = issue!(identity)
      {:ok, _} = Identity.revoke_session(session)

      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer " <> session.token)
        |> call()

      refute conn.halted
      assert conn.assigns[:current_identity] == nil
    end
  end

  describe "gate mode (require: true)" do
    test "halts with 401 for missing Authorization" do
      conn = Phoenix.ConnTest.build_conn() |> call(require: true)
      assert conn.halted
      assert conn.status == 401
    end

    test "halts with 401 for malformed token" do
      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer broken")
        |> call(require: true)

      assert conn.halted
      assert conn.status == 401
    end

    test "halts with 401 for revoked token" do
      identity = seed_identity!()
      session = issue!(identity)
      {:ok, _} = Identity.revoke_session(session)

      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer " <> session.token)
        |> call(require: true)

      assert conn.halted
      assert conn.status == 401
    end

    test "passes (and assigns :current_identity) for a valid token" do
      identity = seed_identity!()
      session = issue!(identity)

      conn =
        Phoenix.ConnTest.build_conn()
        |> Plug.Conn.put_req_header("authorization", "Bearer " <> session.token)
        |> call(require: true)

      refute conn.halted
      assert conn.assigns[:current_identity].id == identity.id
      assert Ash.PlugHelpers.get_actor(conn).id == identity.id
    end
  end
end
