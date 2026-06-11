defmodule Yawp.Federation.NotificationEnvelopeTest do
  use Yawp.DataCase, async: false

  alias Yawp.Federation
  alias Yawp.Federation.NotificationEnvelope
  alias Yawp.Federation.NotificationSignature
  alias Yawp.Federation.KeyDocCache

  setup do
    KeyDocCache.clear()
    {:ok, _} = Federation.generate_server_key()
    :ok
  end

  test "builds a signed envelope without a body field" do
    assert {:ok, envelope} =
             NotificationEnvelope.build(%{
               user_did: "did:yawp:recipient",
               source: "room_mention",
               source_server: "anchor-a.example",
               room_id_or_thread_id: "channel-1",
               message_id: "message-1",
               timestamp: "2026-06-11T00:00:00Z"
             })

    refute Map.has_key?(envelope, "body")
    assert is_binary(envelope["envelope_id"])
    assert envelope["kind"] == "notification"
    assert envelope["source"] == "room_mention"
    assert envelope["signature"] == envelope["source_server_signature"]
    assert is_binary(envelope["signed_by"])
  end

  test "built envelopes verify against the signed canonical input" do
    {:ok, active} = Federation.get_active_server_key()

    Req.Test.stub(Yawp.Federation.KeyDocFetcher, fn conn ->
      Req.Test.json(conn, %{
        "server_id" => "anchor-a.example",
        "keys" => [
          %{
            "key_id" => active.key_id,
            "alg" => "Ed25519",
            ("public_" <> "key") => Base.url_encode64(active.public_key, padding: false),
            "not_before" => "2020-01-01T00:00:00Z",
            "not_after" => "2999-01-01T00:00:00Z"
          }
        ],
        "revoked" => []
      })
    end)

    assert {:ok, envelope} =
             NotificationEnvelope.build(%{
               user_did: "did:yawp:recipient",
               source: "room_mention",
               source_server: "anchor-a.example",
               room_id_or_thread_id: "channel-1",
               message_id: "message-1",
               timestamp: "2026-06-11T00:00:00Z"
             })

    assert :ok = NotificationSignature.verify(envelope, "anchor-a.example")
  end

  test "built envelopes append through the production inbox push path" do
    {:ok, active} = Federation.get_active_server_key()

    Req.Test.stub(Yawp.Federation.KeyDocFetcher, fn conn ->
      Req.Test.json(conn, %{
        "server_id" => "anchor-a.example",
        "keys" => [
          %{
            "key_id" => active.key_id,
            "alg" => "Ed25519",
            ("public_" <> "key") => Base.url_encode64(active.public_key, padding: false),
            "not_before" => "2020-01-01T00:00:00Z",
            "not_after" => "2999-01-01T00:00:00Z"
          }
        ],
        "revoked" => []
      })
    end)

    assert {:ok, envelope} =
             NotificationEnvelope.build(%{
               user_did: "did:yawp:recipient",
               source: "room_mention",
               source_server: "anchor-a.example",
               room_id_or_thread_id: "channel-1",
               message_id: "message-1",
               timestamp: "2026-06-11T00:00:00Z"
             })

    body =
      Yawp.Federation.Wrapper.encode_body(envelope, sender_anchor_id: "anchor-a.example")
      |> Jason.decode!()

    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Conn.put_req_header("content-type", "application/json")
      |> Phoenix.ConnTest.dispatch(YawpWeb.Endpoint, :post, "/federation/inbox/push", body)

    assert Phoenix.ConnTest.json_response(conn, 200) == %{"status" => "appended"}
    assert {:ok, [entry]} = Federation.pull_inbox("did:yawp:recipient", 0, 10)
    assert entry.envelope_id == envelope["envelope_id"]
    assert entry.kind == "notification"
  end
end
