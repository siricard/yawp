defmodule Yawp.Federation.AnchorAdoptionTest do
  @moduledoc """
  Inbound `POST /federation/anchors/adopt` and the
  `AnchorAdoptionWorker` that drives it.

  When a user adds a second anchor (B), their existing anchor (A)
  POSTs a signed adoption envelope to B. The envelope rides inside the
  standard signed delivery wrapper, so B authenticates A's server
  signature against A's published key document before creating the
  local Identity row. The adoption envelope carries the user's signed
  PPE (which proves the user exists and lists A as a source anchor); B
  then pulls the private blob from A.
  """
  use YawpWeb.ConnCase, async: false

  import Bitwise

  alias Yawp.Federation
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.Wrapper
  alias Yawp.Identity

  @host "anchor-a.example"
  @stub Yawp.Federation.KeyDocFetcher

  setup do
    KeyDocCache.clear()
    DeliveryNonceCache.clear()

    {:ok, _} = Federation.generate_server_key()
    {:ok, active} = Federation.get_active_server_key()
    stub_key_doc(active)

    :ok
  end

  defp stub_key_doc(active) do
    encoded_pub = Base.url_encode64(active.public_key, padding: false)

    doc = %{
      "server_id" => @host,
      "keys" => [
        %{
          "key_id" => active.key_id,
          "alg" => "Ed25519",
          "public_key" => encoded_pub,
          "not_before" => "2020-01-01T00:00:00Z",
          "not_after" => "2999-01-01T00:00:00Z"
        }
      ],
      "revoked" => []
    }

    Req.Test.stub(@stub, fn conn -> Req.Test.json(conn, doc) end)
  end

  defp signed(inner) do
    Jason.decode!(Wrapper.encode_body(inner, sender_anchor_id: @host))
  end

  defp post_federation(conn, path, inner) do
    conn
    |> put_req_header("content-type", "application/json")
    |> post(path, signed(inner))
  end

  defp tamper(<<first, rest::binary>>), do: <<bxor(first, 1), rest::binary>>

  defp sign_ppe(payload, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, "signature"))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, "signature", Base.url_encode64(sig, padding: false))
  end

  defp adoption_inner(opts \\ []) do
    {pub, priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pub)
    encoded_pk = Base.url_encode64(pub, padding: false)

    base_ppe = %{
      "did" => did,
      "profile_version" => Keyword.get(opts, :profile_version, 3),
      "public_key" => encoded_pk,
      "anchors" => Keyword.get(opts, :anchors, [@host]),
      "display_name" => "Alice"
    }

    ppe =
      if Keyword.get(opts, :sign_ppe?, true) do
        sign_ppe(base_ppe, priv)
      else
        base_ppe
      end

    %{
      did: did,
      master_pub: pub,
      inner: %{
        "did" => did,
        "master_public_key" => encoded_pk,
        "ppe" => ppe,
        "source_anchor" => @host
      }
    }
  end

  describe "POST /federation/anchors/adopt" do
    test "creates a local identity from a signed adoption envelope", %{conn: conn} do
      %{did: did, inner: inner} = adoption_inner()

      conn = post_federation(conn, "/federation/anchors/adopt", inner)

      assert json_response(conn, 200) == %{"status" => "adopted"}

      assert {:ok, identity} = Identity.get_identity_by_did(did)
      assert identity.did == did
      assert @host in identity.anchor_list
    end

    test "caches the user's PPE so the new anchor can render them", %{conn: conn} do
      %{did: did, inner: inner} = adoption_inner(profile_version: 6)

      post_federation(conn, "/federation/anchors/adopt", inner)

      assert {:ok, ppe} = Identity.get_ppe_by_did(did)
      assert ppe.profile_version == 6
      assert ppe.display_name == "Alice"
    end

    test "rejects a tampered wrapper signature with 401", %{conn: conn} do
      %{inner: inner} = adoption_inner()
      body = signed(inner)

      tampered =
        Map.update!(body, "signature", fn sig_b64 ->
          {:ok, sig} = Base.decode64(sig_b64)
          Base.encode64(tamper(sig))
        end)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/federation/anchors/adopt", tampered)

      assert json_response(conn, 401) == %{"error" => "invalid_signature"}
    end

    test "rejects an adoption envelope whose DID does not match the master key", %{conn: conn} do
      %{inner: inner} = adoption_inner()
      bad = Map.put(inner, "did", "did:yawp:WRONG")

      conn = post_federation(conn, "/federation/anchors/adopt", bad)
      assert json_response(conn, 422) == %{"error" => "invalid_adoption"}
    end

    test "is idempotent: re-adopting the same DID is a no-op success", %{conn: conn} do
      %{did: did, inner: inner} = adoption_inner()

      build_conn() |> post_federation("/federation/anchors/adopt", inner)
      conn = post_federation(conn, "/federation/anchors/adopt", inner)

      assert json_response(conn, 200) == %{"status" => "adopted"}
      assert {:ok, _identity} = Identity.get_identity_by_did(did)
    end

    test "rejects an adoption whose PPE cannot be cached (no identity row written)", %{conn: conn} do
      %{did: did, inner: inner} = adoption_inner(sign_ppe?: false)

      conn = post_federation(conn, "/federation/anchors/adopt", inner)
      assert json_response(conn, 422) == %{"error" => "invalid_adoption"}

      assert {:ok, nil} = Identity.get_ppe_by_did(did)
      assert {:error, %Ash.Error.Invalid{}} = Identity.get_identity_by_did(did)
    end
  end
end
