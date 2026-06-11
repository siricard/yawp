defmodule Yawp.Federation.NotificationEnvelopeTest do
  use Yawp.DataCase, async: false

  alias Yawp.Federation
  alias Yawp.Federation.NotificationEnvelope

  setup do
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
    assert envelope["kind"] == "notification"
    assert envelope["source"] == "room_mention"
    assert envelope["signature"] == envelope["source_server_signature"]
    assert is_binary(envelope["signed_by"])
  end
end
