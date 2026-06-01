defmodule Yawp.Identity.SessionTokenTest do
  @moduledoc """
  server-side opaque session + refresh tokens.

  Covers issue_pair, rotate, revoke_all_for_device, verify_session,
  and concurrent rotation safety.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity
  alias Yawp.Identity.{Identity, RefreshToken, SessionToken}

  import Ecto.Query
  require Ash.Query

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
    Ash.Seed.seed!(Identity, %{did: did, master_public_key: pk})
  end

  describe "issue_pair/2" do
    test "returns distinct opaque 22-char base64url tokens; both rows persist" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()

      assert {:ok, %{session_token: session, refresh_token: refresh}} =
               Yawp.Identity.issue_pair(identity.id, device_id)

      assert String.length(session.token) == 22
      assert String.length(refresh.token) == 22
      assert session.token != refresh.token
      assert {:ok, _} = Base.url_decode64(session.token <> "==", padding: false)
      assert {:ok, _} = Base.url_decode64(refresh.token <> "==", padding: false)

      assert session.identity_id == identity.id
      assert refresh.identity_id == identity.id
      assert session.device_id == device_id
      assert refresh.device_id == device_id

      session_ttl = DateTime.diff(session.expires_at, DateTime.utc_now(), :second)
      refresh_ttl = DateTime.diff(refresh.expires_at, DateTime.utc_now(), :second)
      assert session_ttl > 55 * 60 and session_ttl <= 60 * 60
      assert refresh_ttl > 13 * 86_400 and refresh_ttl <= 14 * 86_400

      assert Yawp.Repo.aggregate("identity_session_tokens", :count) == 1
      assert Yawp.Repo.aggregate("identity_refresh_tokens", :count) == 1
    end
  end

  describe "verify_session/1" do
    test "returns {:ok, identity} for a valid session token" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{session_token: session}} = Yawp.Identity.issue_pair(identity.id, device_id)

      assert {:ok, found} = Yawp.Identity.verify_session(session.token)
      assert found.id == identity.id
      assert found.did == identity.did
    end

    test "returns {:error, :invalid_session} for unknown token" do
      assert {:error, :invalid_session} = Yawp.Identity.verify_session("nopenope")
    end

    test "returns {:error, :invalid_session} for revoked token" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{session_token: session}} = Yawp.Identity.issue_pair(identity.id, device_id)

      {:ok, _} = Yawp.Identity.revoke_session(session)

      assert {:error, :invalid_session} = Yawp.Identity.verify_session(session.token)
    end

    test "returns {:error, :invalid_session} for expired token" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{session_token: session}} = Yawp.Identity.issue_pair(identity.id, device_id)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      Yawp.Repo.update_all(
        from(s in "identity_session_tokens",
          where: s.id == type(^session.id, Ecto.UUID)
        ),
        set: [expires_at: past]
      )

      assert {:error, :invalid_session} = Yawp.Identity.verify_session(session.token)
    end
  end

  describe "rotate_refresh/1" do
    test "rotates the refresh atomically: old has rotated_to set, fresh pair returned" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = Yawp.Identity.issue_pair(identity.id, device_id)

      assert {:ok, %{session_token: new_session, refresh_token: new_refresh}} =
               Yawp.Identity.rotate_refresh(refresh.token)

      assert new_refresh.token != refresh.token
      assert new_session.identity_id == identity.id
      assert new_refresh.identity_id == identity.id
      assert new_session.device_id == device_id
      assert new_refresh.device_id == device_id

      old_row =
        RefreshToken
        |> Ash.Query.for_read(:get_by_token, %{token: refresh.token})
        |> Ash.read_one!(authorize?: false)

      assert old_row.rotated_to == new_refresh.id
    end

    test "rotate of an already-rotated refresh returns {:error, :rotated}" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = Yawp.Identity.issue_pair(identity.id, device_id)

      assert {:ok, _} = Yawp.Identity.rotate_refresh(refresh.token)
      assert {:error, :rotated} = Yawp.Identity.rotate_refresh(refresh.token)
    end

    test "rotate of a revoked refresh returns {:error, :revoked}" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = Yawp.Identity.issue_pair(identity.id, device_id)

      {:ok, _} =
        refresh
        |> Ash.Changeset.for_update(:revoke, %{})
        |> Ash.update(authorize?: false)

      assert {:error, :revoked} = Yawp.Identity.rotate_refresh(refresh.token)
    end

    test "rotate of an expired refresh returns {:error, :expired}" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = Yawp.Identity.issue_pair(identity.id, device_id)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      Yawp.Repo.update_all(
        from(r in "identity_refresh_tokens",
          where: r.id == type(^refresh.id, Ecto.UUID)
        ),
        set: [expires_at: past]
      )

      assert {:error, :expired} = Yawp.Identity.rotate_refresh(refresh.token)
    end

    test "rotate of an unknown token returns {:error, :invalid}" do
      assert {:error, :invalid} = Yawp.Identity.rotate_refresh("nopenope")
    end
  end

  describe "concurrent rotate_refresh/1" do
    test "with N concurrent rotators, exactly one wins; the rest see :rotated" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = Yawp.Identity.issue_pair(identity.id, device_id)

      parent = self()
      n = 6

      tasks =
        for _ <- 1..n do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())
            Yawp.Identity.rotate_refresh(refresh.token)
          end)
        end

      results = Task.await_many(tasks, 10_000)

      ok_count = Enum.count(results, &match?({:ok, _}, &1))
      rotated_count = Enum.count(results, &match?({:error, :rotated}, &1))

      assert ok_count == 1,
             "expected exactly 1 winner, got #{ok_count}; results=#{inspect(results)}"

      assert ok_count + rotated_count == n,
             "unexpected error tuples: #{inspect(results)}"
    end
  end

  describe "revoke_all_for_device/2" do
    test "flips revoked_at on every matching session + refresh row, leaves other devices alone" do
      identity = seed_identity!()
      device_a = Ecto.UUID.generate()
      device_b = Ecto.UUID.generate()

      {:ok, %{session_token: sa1, refresh_token: ra1}} =
        Yawp.Identity.issue_pair(identity.id, device_a)

      {:ok, %{session_token: sa2, refresh_token: ra2}} =
        Yawp.Identity.issue_pair(identity.id, device_a)

      {:ok, %{session_token: sb, refresh_token: rb}} =
        Yawp.Identity.issue_pair(identity.id, device_b)

      assert :ok = Yawp.Identity.revoke_all_for_device(identity.id, device_a)

      assert reload_session(sa1).revoked_at != nil
      assert reload_session(sa2).revoked_at != nil
      assert reload_refresh(ra1).revoked_at != nil
      assert reload_refresh(ra2).revoked_at != nil

      assert reload_session(sb).revoked_at == nil
      assert reload_refresh(rb).revoked_at == nil
    end
  end

  describe "revoke_all_for_identity/1" do
    test "flips revoked_at on every session + refresh row across all devices for the identity" do
      identity = seed_identity!()
      other = seed_identity!()
      device_a = Ecto.UUID.generate()
      device_b = Ecto.UUID.generate()

      {:ok, %{session_token: sa, refresh_token: ra}} =
        Yawp.Identity.issue_pair(identity.id, device_a)

      {:ok, %{session_token: sb, refresh_token: rb}} =
        Yawp.Identity.issue_pair(identity.id, device_b)

      {:ok, %{session_token: so, refresh_token: ro}} =
        Yawp.Identity.issue_pair(other.id, Ecto.UUID.generate())

      assert :ok = Yawp.Identity.revoke_all_for_identity(identity.id)

      assert reload_session(sa).revoked_at != nil
      assert reload_session(sb).revoked_at != nil
      assert reload_refresh(ra).revoked_at != nil
      assert reload_refresh(rb).revoked_at != nil

      assert reload_session(so).revoked_at == nil
      assert reload_refresh(ro).revoked_at == nil
    end
  end

  defp reload_session(s) do
    SessionToken
    |> Ash.Query.filter(id == ^s.id)
    |> Ash.read_one!(authorize?: false)
  end

  defp reload_refresh(r) do
    RefreshToken
    |> Ash.Query.filter(id == ^r.id)
    |> Ash.read_one!(authorize?: false)
  end
end
