defmodule YawpWeb.FederationControllerTest do
  @moduledoc """
  Inbound `/federation/*` endpoints. Each request body is a signed
  delivery wrapper; the controller verifies the relaying anchor's
  signature against its published key document (stubbed here via
  `Req.Test`) before applying the inner payload to local state.
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

  defp fresh_pubkey do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    Base.url_encode64(pub, padding: false)
  end

  defp ppe_envelope(did, version, attrs \\ %{}) do
    encoded_pk = fresh_pubkey()

    Map.merge(
      %{
        "did" => did,
        "profile_version" => version,
        "public_key" => encoded_pk,
        "anchors" => ["anchor-a.example"],
        "display_name" => "Alice"
      },
      attrs
    )
  end

  describe "POST /federation/ppe/push" do
    test "applies a fresh PPE and reports applied", %{conn: conn} do
      did = "did:yawp:ppe-fresh"
      conn = post_federation(conn, "/federation/ppe/push", ppe_envelope(did, 3))

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, ppe} = Identity.get_ppe_by_did(did)
      assert ppe.profile_version == 3
      assert ppe.display_name == "Alice"
    end

    test "is a no-op for a stale PPE" do
      did = "did:yawp:ppe-stale"
      build_conn() |> post_federation("/federation/ppe/push", ppe_envelope(did, 5))

      conn =
        build_conn()
        |> post_federation(
          "/federation/ppe/push",
          ppe_envelope(did, 2, %{"display_name" => "Old"})
        )

      assert json_response(conn, 200) == %{"status" => "stale"}
      assert {:ok, ppe} = Identity.get_ppe_by_did(did)
      assert ppe.profile_version == 5
      assert ppe.display_name == "Alice"
    end

    test "rejects a tampered wrapper signature with 401", %{conn: conn} do
      body = signed(ppe_envelope("did:yawp:nope", 1))

      tampered =
        Map.update!(body, "signature", fn sig_b64 ->
          {:ok, sig} = Base.decode64(sig_b64)
          Base.encode64(tamper(sig))
        end)

      conn =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/federation/ppe/push", tampered)

      assert json_response(conn, 401) == %{"error" => "invalid_signature"}
    end

    test "rejects a replayed wrapper with 409", %{conn: conn} do
      body = signed(ppe_envelope("did:yawp:replay", 1))

      first =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post("/federation/ppe/push", body)

      assert json_response(first, 200)

      second =
        conn
        |> put_req_header("content-type", "application/json")
        |> post("/federation/ppe/push", body)

      assert json_response(second, 409) == %{"error" => "replay"}
    end
  end

  describe "GET /federation/ppe/:did" do
    test "returns the cached envelope for a known DID", %{conn: conn} do
      did = "did:yawp:ppe-get"

      build_conn()
      |> post_federation("/federation/ppe/push", ppe_envelope(did, 4))

      conn = get(conn, "/federation/ppe/#{URI.encode_www_form(did)}")

      assert %{"ppe" => envelope} = json_response(conn, 200)
      assert envelope["did"] == did
      assert envelope["profile_version"] == 4
    end

    test "returns 404 for an unknown DID", %{conn: conn} do
      conn = get(conn, "/federation/ppe/#{URI.encode_www_form("did:yawp:ghost")}")
      assert json_response(conn, 404) == %{"error" => "unknown_ppe"}
    end
  end

  describe "POST /federation/blob/push" do
    test "persists ciphertext for a fresh blob", %{conn: conn} do
      did = "did:yawp:blob-fresh"
      ciphertext = :crypto.strong_rand_bytes(48)

      inner = %{
        "did" => did,
        "ciphertext" => Base.encode64(ciphertext),
        "blob_version" => 2
      }

      conn = post_federation(conn, "/federation/blob/push", inner)

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, blob} = Identity.get_private_blob_by_did(did)
      assert blob.blob_version == 2
      assert blob.ciphertext == ciphertext
    end

    test "rejects a non-base64 ciphertext with 422", %{conn: conn} do
      inner = %{"did" => "did:yawp:bad", "ciphertext" => "!!!notb64!!!", "blob_version" => 1}
      conn = post_federation(conn, "/federation/blob/push", inner)
      assert json_response(conn, 422) == %{"error" => "invalid_blob"}
    end
  end

  describe "POST /federation/inbox/push" do
    test "appends an envelope addressed to a single recipient", %{conn: conn} do
      did = "did:yawp:inbox-one"

      envelope = %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "recipient_did" => did,
        "conversation_id" => "conv-1",
        "kind" => "dm",
        "ciphertext" => "opaque"
      }

      conn = post_federation(conn, "/federation/inbox/push", envelope)

      assert json_response(conn, 200) == %{"status" => "appended"}
      assert {:ok, [entry]} = Federation.pull_inbox(did, 0, 100)
      assert entry.envelope_id == envelope["envelope_id"]
    end

    test "fans an envelope out to multiple recipients", %{conn: conn} do
      env_id = "env-#{System.unique_integer([:positive])}"

      envelope = %{
        "envelope_id" => env_id,
        "recipient_dids" => ["did:yawp:r1", "did:yawp:r2"],
        "kind" => "notification"
      }

      conn = post_federation(conn, "/federation/inbox/push", envelope)
      assert json_response(conn, 200) == %{"status" => "appended"}

      assert {:ok, [e1]} = Federation.pull_inbox("did:yawp:r1", 0, 100)
      assert {:ok, [e2]} = Federation.pull_inbox("did:yawp:r2", 0, 100)
      assert e1.envelope_id == env_id
      assert e2.envelope_id == env_id
    end

    test "rejects an envelope with no recipient with 422", %{conn: conn} do
      conn = post_federation(conn, "/federation/inbox/push", %{"envelope_id" => "x"})
      assert json_response(conn, 422) == %{"error" => "invalid_envelope"}
    end
  end

  describe "POST /federation/devices/changed" do
    test "applies a device-subkey change to an existing identity", %{conn: conn} do
      {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
      did = Identity.did_from_pubkey(pub)

      {:ok, identity} =
        Yawp.Identity.Identity
        |> Ash.Changeset.for_create(:upsert_via_invite, %{did: did, master_public_key: pub})
        |> Ash.create(authorize?: false)

      subkeys = %{"subkeys" => [%{"device_id" => "d1", "pk" => "pk1"}]}
      inner = %{"did" => did, "device_subkeys" => subkeys, "profile_version" => 9}

      conn = post_federation(conn, "/federation/devices/changed", inner)

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert reloaded.device_subkeys == subkeys
      assert reloaded.profile_version == 9
    end

    test "returns 404 for an unknown identity", %{conn: conn} do
      inner = %{"did" => "did:yawp:ghost", "device_subkeys" => %{"subkeys" => []}}
      conn = post_federation(conn, "/federation/devices/changed", inner)
      assert json_response(conn, 404) == %{"error" => "unknown_identity"}
    end
  end

  describe "POST /federation/pull" do
    test "returns envelopes after a cursor serial, oldest first", %{conn: conn} do
      did = "did:yawp:pull"

      for n <- 1..3 do
        build_conn()
        |> post_federation("/federation/inbox/push", %{
          "envelope_id" => "p#{n}",
          "recipient_did" => did,
          "kind" => "dm"
        })
      end

      conn =
        post_federation(conn, "/federation/pull", %{"recipient_did" => did, "since_serial" => 0})

      assert %{"envelopes" => envelopes} = json_response(conn, 200)
      assert length(envelopes) == 3
      serials = Enum.map(envelopes, & &1["inbox_serial"])
      assert serials == Enum.sort(serials)

      cursor = List.last(serials)

      after_conn =
        build_conn()
        |> post_federation("/federation/pull", %{"recipient_did" => did, "since_serial" => cursor})

      assert %{"envelopes" => []} = json_response(after_conn, 200)
    end

    test "rejects a pull request with no recipient with 422", %{conn: conn} do
      conn = post_federation(conn, "/federation/pull", %{"since_serial" => 0})
      assert json_response(conn, 422) == %{"error" => "invalid_pull_request"}
    end
  end
end
