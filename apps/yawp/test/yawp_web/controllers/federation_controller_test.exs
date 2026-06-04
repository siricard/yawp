defmodule YawpWeb.FederationControllerTest do
  use YawpWeb.ConnCase, async: false
  use Oban.Testing, repo: Yawp.Repo

  import Bitwise

  alias Yawp.Federation
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.PpeRefreshWorker
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

  defp user_keypair, do: :crypto.generate_key(:eddsa, :ed25519)

  defp did_for(pub), do: "did:yawp:" <> Identity.did_from_pubkey(pub)

  defp sign_inner(payload, sig_field, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, sig_field))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, sig_field, Base.url_encode64(sig, padding: false))
  end

  defp signed_ppe(pub, priv, version, attrs \\ %{}) do
    %{
      "did" => did_for(pub),
      "profile_version" => version,
      "public_key" => Base.url_encode64(pub, padding: false),
      "anchors" => ["anchor-a.example"],
      "display_name" => "Alice"
    }
    |> Map.merge(attrs)
    |> sign_inner("signature", priv)
  end

  describe "POST /federation/ppe/push" do
    test "applies a fresh PPE and reports applied", %{conn: conn} do
      {pub, priv} = user_keypair()
      ppe = signed_ppe(pub, priv, 3)
      conn = post_federation(conn, "/federation/ppe/push", ppe)

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, stored} = Identity.get_ppe_by_did(ppe["did"])
      assert stored.profile_version == 3
      assert stored.display_name == "Alice"
    end

    test "is a no-op for a stale PPE" do
      {pub, priv} = user_keypair()

      build_conn() |> post_federation("/federation/ppe/push", signed_ppe(pub, priv, 5))

      conn =
        build_conn()
        |> post_federation(
          "/federation/ppe/push",
          signed_ppe(pub, priv, 2, %{"display_name" => "Old"})
        )

      assert json_response(conn, 200) == %{"status" => "stale"}
      assert {:ok, stored} = Identity.get_ppe_by_did(did_for(pub))
      assert stored.profile_version == 5
      assert stored.display_name == "Alice"
    end

    test "rejects a PPE whose inner user signature is invalid with 403", %{conn: conn} do
      {pub, priv} = user_keypair()
      ppe = signed_ppe(pub, priv, 1, %{"display_name" => "Tampered after signing"})
      forged = Map.put(ppe, "display_name", "Mallory")

      conn = post_federation(conn, "/federation/ppe/push", forged)

      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
      assert {:ok, nil} = Identity.get_ppe_by_did(ppe["did"])
    end

    test "rejects a PPE with no inner signature with 403", %{conn: conn} do
      {pub, _priv} = user_keypair()

      unsigned = %{
        "did" => did_for(pub),
        "profile_version" => 1,
        "public_key" => Base.url_encode64(pub, padding: false),
        "anchors" => ["anchor-a.example"]
      }

      conn = post_federation(conn, "/federation/ppe/push", unsigned)
      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
    end

    test "rejects a PPE whose DID does not derive from the public key with 403", %{conn: conn} do
      {pub, priv} = user_keypair()
      {other_pub, _} = user_keypair()

      ppe =
        signed_ppe(pub, priv, 1)
        |> Map.put("did", did_for(other_pub))
        |> sign_inner("signature", priv)

      conn = post_federation(conn, "/federation/ppe/push", ppe)
      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
    end

    test "rejects a tampered wrapper signature with 401", %{conn: conn} do
      {pub, priv} = user_keypair()
      body = signed(signed_ppe(pub, priv, 1))

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
      {pub, priv} = user_keypair()
      body = signed(signed_ppe(pub, priv, 1))

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
      {pub, priv} = user_keypair()

      build_conn()
      |> post_federation("/federation/ppe/push", signed_ppe(pub, priv, 4))

      did = did_for(pub)
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
    defp signed_blob(pub, priv, version, ciphertext_b64) do
      %{
        "did" => did_for(pub),
        "ciphertext" => ciphertext_b64,
        "blob_version" => version,
        "public_key" => Base.url_encode64(pub, padding: false)
      }
      |> sign_inner("signature", priv)
    end

    test "persists ciphertext for a fresh blob", %{conn: conn} do
      {pub, priv} = user_keypair()
      ciphertext = :crypto.strong_rand_bytes(48)
      inner = signed_blob(pub, priv, 2, Base.encode64(ciphertext))

      conn = post_federation(conn, "/federation/blob/push", inner)

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, blob} = Identity.get_private_blob_by_did(inner["did"])
      assert blob.blob_version == 2
      assert blob.ciphertext == ciphertext
    end

    test "rejects a non-base64 ciphertext with 422", %{conn: conn} do
      {pub, priv} = user_keypair()
      inner = signed_blob(pub, priv, 1, "!!!notb64!!!")
      conn = post_federation(conn, "/federation/blob/push", inner)
      assert json_response(conn, 422) == %{"error" => "invalid_blob"}
    end

    test "rejects a blob with an invalid inner signature with 403", %{conn: conn} do
      {pub, priv} = user_keypair()
      inner = signed_blob(pub, priv, 1, Base.encode64("x"))
      forged = Map.put(inner, "blob_version", 99)

      conn = post_federation(conn, "/federation/blob/push", forged)
      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
      assert {:ok, nil} = Identity.get_private_blob_by_did(inner["did"])
    end
  end

  describe "POST /federation/inbox/push" do
    defp signed_envelope(pub, priv, attrs) do
      %{
        "envelope_id" => "env-#{System.unique_integer([:positive])}",
        "sender_did" => did_for(pub),
        "public_key" => Base.url_encode64(pub, padding: false),
        "kind" => "dm"
      }
      |> Map.merge(attrs)
      |> sign_inner("sender_signature", priv)
    end

    test "appends an envelope addressed to a single recipient", %{conn: conn} do
      {pub, priv} = user_keypair()
      did = "did:yawp:inbox-one"

      envelope =
        signed_envelope(pub, priv, %{"recipient_did" => did, "conversation_id" => "conv-1"})

      conn = post_federation(conn, "/federation/inbox/push", envelope)

      assert json_response(conn, 200) == %{"status" => "appended"}
      assert {:ok, [entry]} = Federation.pull_inbox(did, 0, 100)
      assert entry.envelope_id == envelope["envelope_id"]
    end

    test "fans an envelope out to multiple recipients", %{conn: conn} do
      {pub, priv} = user_keypair()

      envelope =
        signed_envelope(pub, priv, %{
          "recipient_dids" => ["did:yawp:r1", "did:yawp:r2"],
          "kind" => "notification"
        })

      conn = post_federation(conn, "/federation/inbox/push", envelope)
      assert json_response(conn, 200) == %{"status" => "appended"}

      assert {:ok, [e1]} = Federation.pull_inbox("did:yawp:r1", 0, 100)
      assert {:ok, [e2]} = Federation.pull_inbox("did:yawp:r2", 0, 100)
      assert e1.envelope_id == envelope["envelope_id"]
      assert e2.envelope_id == envelope["envelope_id"]
    end

    test "rejects an envelope with no recipient with 422", %{conn: conn} do
      {pub, priv} = user_keypair()
      envelope = signed_envelope(pub, priv, %{})
      conn = post_federation(conn, "/federation/inbox/push", envelope)
      assert json_response(conn, 422) == %{"error" => "invalid_envelope"}
    end

    test "rejects an envelope whose recipient_dids contain a non-string with 422", %{conn: conn} do
      {pub, priv} = user_keypair()
      envelope = signed_envelope(pub, priv, %{"recipient_dids" => [123]})
      conn = post_federation(conn, "/federation/inbox/push", envelope)
      assert json_response(conn, 422) == %{"error" => "invalid_envelope"}
    end

    test "rejects an envelope with an invalid inner signature with 403", %{conn: conn} do
      {pub, priv} = user_keypair()
      envelope = signed_envelope(pub, priv, %{"recipient_did" => "did:yawp:victim"})
      forged = Map.put(envelope, "body", "forged content")

      conn = post_federation(conn, "/federation/inbox/push", forged)
      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
      assert {:ok, []} = Federation.pull_inbox("did:yawp:victim", 0, 100)
    end

    test "enqueues a PPE refresh when the envelope advertises a newer sender_profile_version",
         %{conn: conn} do
      {pub, priv} = user_keypair()
      sender_did = did_for(pub)

      {:ok, :applied} =
        Identity.apply_ppe_if_newer(%{
          "did" => sender_did,
          "public_key" => Base.url_encode64(pub, padding: false),
          "profile_version" => 2,
          "anchors" => ["anchor-a.example"],
          "display_name" => "Sender"
        })

      envelope =
        signed_envelope(pub, priv, %{
          "recipient_did" => "did:yawp:inbox-recipient",
          "sender_profile_version" => 9
        })

      conn = post_federation(conn, "/federation/inbox/push", envelope)
      assert json_response(conn, 200) == %{"status" => "appended"}

      assert_enqueued(
        worker: PpeRefreshWorker,
        args: %{"did" => sender_did, "anchors" => ["anchor-a.example"]}
      )
    end
  end

  describe "POST /federation/devices/changed" do
    test "applies a device-subkey change to an existing identity", %{conn: conn} do
      {pub, priv} = user_keypair()
      did = did_for(pub)

      {:ok, identity} =
        Yawp.Identity.Identity
        |> Ash.Changeset.for_create(:upsert_via_invite, %{did: did, master_public_key: pub})
        |> Ash.create(authorize?: false)

      subkeys = %{"subkeys" => [%{"device_id" => "d1", "pk" => "pk1"}]}

      inner =
        %{
          "did" => did,
          "public_key" => Base.url_encode64(pub, padding: false),
          "device_subkeys" => subkeys,
          "profile_version" => 9
        }
        |> sign_inner("signature", priv)

      conn = post_federation(conn, "/federation/devices/changed", inner)

      assert json_response(conn, 200) == %{"status" => "applied"}
      assert {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert reloaded.device_subkeys == subkeys
      assert reloaded.profile_version == 9
    end

    test "rejects a device change with an invalid inner signature with 403", %{conn: conn} do
      {pub, priv} = user_keypair()
      did = did_for(pub)

      {:ok, _identity} =
        Yawp.Identity.Identity
        |> Ash.Changeset.for_create(:upsert_via_invite, %{did: did, master_public_key: pub})
        |> Ash.create(authorize?: false)

      inner =
        %{
          "did" => did,
          "public_key" => Base.url_encode64(pub, padding: false),
          "device_subkeys" => %{"subkeys" => []}
        }
        |> sign_inner("signature", priv)
        |> Map.put("device_subkeys", %{"subkeys" => [%{"device_id" => "evil", "pk" => "x"}]})

      conn = post_federation(conn, "/federation/devices/changed", inner)
      assert json_response(conn, 403) == %{"error" => "invalid_inner_signature"}
    end

    test "returns 404 for an unknown identity", %{conn: conn} do
      {pub, priv} = user_keypair()

      inner =
        %{
          "did" => did_for(pub),
          "public_key" => Base.url_encode64(pub, padding: false),
          "device_subkeys" => %{"subkeys" => []}
        }
        |> sign_inner("signature", priv)

      conn = post_federation(conn, "/federation/devices/changed", inner)
      assert json_response(conn, 404) == %{"error" => "unknown_identity"}
    end
  end

  describe "POST /federation/pull" do
    test "returns envelopes after a cursor serial, oldest first", %{conn: conn} do
      {pub, priv} = user_keypair()
      did = "did:yawp:pull"

      for n <- 1..3 do
        build_conn()
        |> post_federation(
          "/federation/inbox/push",
          signed_envelope(pub, priv, %{"recipient_did" => did, "envelope_id" => "p#{n}"})
        )
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
