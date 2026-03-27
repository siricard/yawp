defmodule YawpWeb.ClaimControllerTest do
  @moduledoc """
  `POST /api/claim` server-claim endpoint.

  Body shape: `{claim_token, did, public_key, sender_signature}`.

  On success: persists `Yawp.Identity.Identity` row (DID + master
  public key), marks the chat owner, consumes the token, returns 200
  with `{ "did": ... }`. On failure: 4xx with `{"error": <slug>}`
  using vocabulary (`claim_token_invalid`,
  `claim_token_expired`, `claim_token_consumed`, `did_mismatch`,
  `invalid_signature`).
  """
  use YawpWeb.ConnCase, async: false

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

  defp issue_token!(account) do
    {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
    claim
  end

  defp build_claim_body(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    payload = %{"claim_token" => token, "did" => did, "pk" => pk_b64}
    canonical = Yawp.CanonicalJson.encode(payload)
    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])
    sig_b64 = Base.url_encode64(sig, padding: false)

    %{
      "claim_token" => token,
      "did" => did,
      "pk" => pk_b64,
      "sender_signature" => sig_b64,
      "_pk_raw" => pk
    }
  end

  describe "POST /api/claim" do
    setup do
                        :ok = Yawp.Servers.Seeder.run()
      :ok
    end

    test "200 + assigns chat owner on a valid signed claim", %{conn: conn} do
      account = create_account!()
      claim = issue_token!(account)
      body = build_claim_body(claim.token)
      pk_raw = body["_pk_raw"]
      body = Map.delete(body, "_pk_raw")

      conn = post(conn, "/api/claim", body)
      assert %{"did" => did} = json_response(conn, 200)
      assert did == body["did"]

            identity = Yawp.Identity.get_identity_by_did!(did)
      assert identity.master_public_key == pk_raw

            conn2 = post(Phoenix.ConnTest.build_conn(), "/api/claim", body)
      assert %{"error" => "claim_token_consumed"} = json_response(conn2, 409)
    end

    test "404 claim_token_invalid for unknown token", %{conn: conn} do
      body = build_claim_body("NOSUCHTOKEN")
      body = Map.delete(body, "_pk_raw")

      conn = post(conn, "/api/claim", body)
      assert %{"error" => "claim_token_invalid"} = json_response(conn, 404)
    end

    test "410 claim_token_expired for an expired token", %{conn: conn} do
      account = create_account!()
      claim = issue_token!(account)

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      {:ok, _} =
        claim
        |> Ash.Changeset.for_update(:force_expire, %{expires_at: past})
        |> Ash.update(authorize?: false)

      body = build_claim_body(claim.token) |> Map.delete("_pk_raw")
      conn = post(conn, "/api/claim", body)
      assert %{"error" => "claim_token_expired"} = json_response(conn, 410)
    end

    test "400 did_mismatch when DID does not match pk", %{conn: conn} do
      account = create_account!()
      claim = issue_token!(account)
      body = build_claim_body(claim.token)
      body = body |> Map.delete("_pk_raw") |> Map.put("did", "did:yawp:WRONG")

      conn = post(conn, "/api/claim", body)
      assert %{"error" => "did_mismatch"} = json_response(conn, 400)
    end

    test "400 invalid_payload when required fields are missing", %{conn: conn} do
      conn = post(conn, "/api/claim", %{"claim_token" => "X"})
      assert %{"error" => "invalid_payload"} = json_response(conn, 400)
    end

    test "400 invalid_payload when pk is not 32 bytes", %{conn: conn} do
      body = %{
        "claim_token" => "X",
        "did" => "did:yawp:abc",
        "pk" => Base.url_encode64(<<1, 2, 3>>, padding: false),
        "sender_signature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false)
      }

      conn = post(conn, "/api/claim", body)
      assert %{"error" => "invalid_payload"} = json_response(conn, 400)
    end

    test "409 claim_token_revoked for a revoked token", %{conn: conn} do
      account = create_account!()
      claim = issue_token!(account)
      {:ok, _} = Admin.revoke_claim_token(claim)

      body = build_claim_body(claim.token) |> Map.delete("_pk_raw")
      conn = post(conn, "/api/claim", body)
      assert %{"error" => "claim_token_revoked"} = json_response(conn, 409)
    end

    test "200 assigns the Owner role membership for the singleton server", %{conn: conn} do
      account = create_account!()
      {:ok, server} = Yawp.Servers.get_singleton_server()
      owner_role = Yawp.Servers.get_system_role_for_server("Owner", server.id)

      claim = issue_token!(account)
      body = build_claim_body(claim.token) |> Map.delete("_pk_raw")

      conn = post(conn, "/api/claim", body)
      assert %{"did" => _, "role" => "Owner"} = json_response(conn, 200)

      identity = Yawp.Identity.get_identity_by_did!(body["did"])

      require Ash.Query

      memberships =
        Yawp.Servers.Membership
        |> Ash.Query.filter(
          identity_id == ^identity.id and server_id == ^server.id and role_id == ^owner_role.id
        )
        |> Ash.read!()

      assert length(memberships) == 1
    end

    test "400 invalid_signature when signature does not verify", %{conn: conn} do
      account = create_account!()
      claim = issue_token!(account)
      body = build_claim_body(claim.token)

            {_pk2, sk2} = :crypto.generate_key(:eddsa, :ed25519)
      canonical = Yawp.CanonicalJson.encode(%{"a" => 1})
      bad = :crypto.sign(:eddsa, :none, canonical, [sk2, :ed25519])

      body =
        body
        |> Map.delete("_pk_raw")
        |> Map.put("sender_signature", Base.url_encode64(bad, padding: false))

      conn = post(conn, "/api/claim", body)
      assert %{"error" => "invalid_signature"} = json_response(conn, 400)
    end
  end
end
