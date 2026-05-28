defmodule Yawp.Identity.RefreshTokenRpcTest do
  @moduledoc """
  `:rotate` create-action on
  `Yawp.Identity.RefreshToken` and `:revoke_device_sessions`
  update-action on `Yawp.Identity.Identity`, both exposed via the
   RPC transport (`POST /rpc/run`).

  Errors surface via `result.errors[0].type` with the
   vocabulary:

    * `refresh_rotated`
    * `refresh_revoked`
    * `refresh_expired`
    * `refresh_invalid`
    * `unauthorized` (cross-identity revoke attempt)
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity, as: IdentityDomain
  alias Yawp.Identity.{Identity, RefreshToken, SessionToken}

  import Ecto.Query
  require Ash.Query

  defp seed_identity!() do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> IdentityDomain.did_from_pubkey(pk)
    Ash.Seed.seed!(Identity, %{did: did, master_public_key: pk})
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp metadata(result), do: Map.get(result, :metadata) || Map.get(result, "metadata") || %{}
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  defp meta_field(meta, atom_key, camel_key) do
    Map.get(meta, atom_key) || Map.get(meta, camel_key) ||
      Map.get(meta, to_string(atom_key)) || Map.get(meta, to_string(camel_key))
  end

  defp run_rotate(token) do
    AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
      "action" => "rotate_refresh",
      "fields" => [],
      "input" => %{"token" => token}
    })
  end

  describe "rotate_refresh RPC (success)" do
    test "issues a fresh session+refresh pair via metadata; old refresh marked rotated_to" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()

      {:ok, %{refresh_token: refresh, session_token: old_session}} =
        IdentityDomain.issue_pair(identity.id, device_id)

      result = run_rotate(refresh.token)
      assert success?(result), inspect(result)

      meta = metadata(result)
      session_token = meta_field(meta, :session_token, :sessionToken)
      refresh_token = meta_field(meta, :refresh_token, :refreshToken)
      expires_at = meta_field(meta, :expires_at, :expiresAt)

      assert is_binary(session_token) and byte_size(session_token) == 22
      assert is_binary(refresh_token) and byte_size(refresh_token) == 22
      assert session_token != old_session.token
      assert refresh_token != refresh.token
      assert expires_at

      old_row =
        RefreshToken
        |> Ash.Query.for_read(:get_by_token, %{token: refresh.token})
        |> Ash.read_one!(authorize?: false)

      assert old_row.rotated_to != nil

      assert {:ok, %Identity{id: id}} = IdentityDomain.verify_session(session_token)
      assert id == identity.id
    end
  end

  describe "rotate_refresh RPC (errors)" do
    test "replay returns refresh_rotated" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = IdentityDomain.issue_pair(identity.id, device_id)

      assert success?(run_rotate(refresh.token))
      result = run_rotate(refresh.token)
      assert success?(result) == false
      assert "refresh_rotated" in error_types(result)
    end

    test "revoked refresh returns refresh_revoked" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = IdentityDomain.issue_pair(identity.id, device_id)

      {:ok, _} =
        refresh
        |> Ash.Changeset.for_update(:revoke, %{})
        |> Ash.update(authorize?: false)

      result = run_rotate(refresh.token)
      assert success?(result) == false
      assert "refresh_revoked" in error_types(result)
    end

    test "expired refresh returns refresh_expired" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, %{refresh_token: refresh}} = IdentityDomain.issue_pair(identity.id, device_id)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      Yawp.Repo.update_all(
        from(r in "identity_refresh_tokens", where: r.id == type(^refresh.id, Ecto.UUID)),
        set: [expires_at: past]
      )

      result = run_rotate(refresh.token)
      assert success?(result) == false
      assert "refresh_expired" in error_types(result)
    end

    test "unknown token returns refresh_invalid" do
      result = run_rotate("nopenope")
      assert success?(result) == false
      assert "refresh_invalid" in error_types(result)
    end
  end

  defp run_revoke(actor, identity_did, device_id) do
    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Conn.assign(:current_identity, actor)
      |> Ash.PlugHelpers.set_actor(actor)

    AshTypescript.Rpc.run_action(:yawp, conn, %{
      "action" => "revoke_device_sessions",
      "identity" => %{"did" => identity_did},
      "fields" => ["id", "did"],
      "input" => %{"deviceId" => device_id}
    })
  end

  describe "revoke_device_sessions RPC" do
    test "revokes every session+refresh for (actor_identity, device_id); other devices unaffected" do
      identity = seed_identity!()
      device_a = Ecto.UUID.generate()
      device_b = Ecto.UUID.generate()

      {:ok, %{session_token: sa, refresh_token: ra}} =
        IdentityDomain.issue_pair(identity.id, device_a)

      {:ok, %{session_token: sb, refresh_token: rb}} =
        IdentityDomain.issue_pair(identity.id, device_b)

      result = run_revoke(identity, identity.did, device_b)
      assert success?(result), inspect(result)

      assert reload_session(sa).revoked_at == nil
      assert reload_refresh(ra).revoked_at == nil
      assert reload_session(sb).revoked_at != nil
      assert reload_refresh(rb).revoked_at != nil
    end

    test "cross-identity revoke attempt returns unauthorized" do
      identity_a = seed_identity!()
      identity_b = seed_identity!()
      device_b = Ecto.UUID.generate()

      {:ok, %{session_token: sb, refresh_token: rb}} =
        IdentityDomain.issue_pair(identity_b.id, device_b)

      result = run_revoke(identity_a, identity_b.did, device_b)

      assert success?(result) == false
      assert "unauthorized" in error_types(result)

      assert reload_session(sb).revoked_at == nil
      assert reload_refresh(rb).revoked_at == nil
    end

    test "unauthenticated call (actor: nil) returns unauthorized" do
      identity = seed_identity!()
      device_id = Ecto.UUID.generate()
      {:ok, _} = IdentityDomain.issue_pair(identity.id, device_id)

      result =
        AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
          "action" => "revoke_device_sessions",
          "identity" => %{"did" => identity.did},
          "fields" => ["id", "did"],
          "input" => %{"deviceId" => device_id}
        })

      assert success?(result) == false
      assert "unauthorized" in error_types(result)
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
