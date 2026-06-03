defmodule Yawp.Federation.TwoAnchorTest do
  @moduledoc """
  End-to-end federation transport: two in-process Bandit listeners
  (`:14000` and `:14100`) serve the federation endpoints over real
  sockets. `Yawp.Federation.Client` wraps and signs a payload on one
  anchor and POSTs it to the other, which verifies the wrapper against
  the published key document (stubbed via `Req.Test`) and applies the
  inner payload. PPE and private-blob updates round-trip; both
  listeners tear down cleanly via `start_supervised!`.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Federation
  alias Yawp.Federation.Client
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocCache
  alias Yawp.Identity

  @anchor_a_port 14_000
  @anchor_b_port 14_100
  @sender_anchor "anchor-a.example"

  setup do
    KeyDocCache.clear()
    DeliveryNonceCache.clear()
    Req.Test.set_req_test_to_shared()

    {:ok, _} = Federation.generate_server_key()
    {:ok, active} = Federation.get_active_server_key()
    stub_key_doc(active)

    start_supervised!(
      Supervisor.child_spec(
        {Bandit, plug: YawpWeb.Endpoint, scheme: :http, port: @anchor_a_port},
        id: :anchor_a
      )
    )

    start_supervised!(
      Supervisor.child_spec(
        {Bandit, plug: YawpWeb.Endpoint, scheme: :http, port: @anchor_b_port},
        id: :anchor_b
      )
    )

    prev = Application.get_env(:yawp, Client)
    Application.put_env(:yawp, Client, anchor_id: @sender_anchor)

    on_exit(fn ->
      if prev do
        Application.put_env(:yawp, Client, prev)
      else
        Application.delete_env(:yawp, Client)
      end
    end)

    :ok
  end

  defp stub_key_doc(active) do
    encoded_pub = Base.url_encode64(active.public_key, padding: false)

    doc = %{
      "server_id" => @sender_anchor,
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

    Req.Test.stub(Yawp.Federation.KeyDocFetcher, fn conn -> Req.Test.json(conn, doc) end)
  end

  defp peer(port), do: "localhost:#{port}"

  test "PPE update round-trips from anchor A to anchor B over real sockets" do
    did = "did:yawp:two-anchor-ppe"

    ppe = %{
      "did" => did,
      "profile_version" => 4,
      "display_name" => "Alice",
      "bio" => "hello from A"
    }

    assert {:ok, %{"status" => "applied"}} = Client.push_ppe!(peer(@anchor_b_port), ppe)

    assert {:ok, stored} = Identity.get_ppe_by_did(did)
    assert stored.profile_version == 4
    assert stored.display_name == "Alice"
    assert stored.envelope["bio"] == "hello from A"
  end

  test "private blob ciphertext round-trips byte-identically from A to B" do
    did = "did:yawp:two-anchor-blob"
    ciphertext = :crypto.strong_rand_bytes(64)

    blob = %{
      "did" => did,
      "ciphertext" => Base.encode64(ciphertext),
      "blob_version" => 7
    }

    assert {:ok, %{"status" => "applied"}} = Client.push_blob!(peer(@anchor_b_port), blob)

    assert {:ok, stored} = Identity.get_private_blob_by_did(did)
    assert stored.blob_version == 7
    assert stored.ciphertext == ciphertext
  end

  test "an inbox envelope pushed to B is retrievable via a pull from A" do
    did = "did:yawp:two-anchor-inbox"
    env_id = "env-#{System.unique_integer([:positive])}"

    envelope = %{
      "envelope_id" => env_id,
      "recipient_did" => did,
      "conversation_id" => "conv-xa",
      "kind" => "dm",
      "ciphertext" => "opaque-bytes"
    }

    assert {:ok, %{"status" => "appended"}} = Client.push_inbox!(peer(@anchor_b_port), envelope)

    assert {:ok, %{"envelopes" => [pulled]}} =
             Client.pull!(peer(@anchor_a_port), %{"recipient_did" => did, "since_serial" => 0})

    assert pulled["envelope_id"] == env_id
    assert pulled["conversation_id"] == "conv-xa"
  end

  test "a replayed wrapper is rejected by the receiving anchor" do
    did = "did:yawp:two-anchor-replay"

    inner = %{"did" => did, "profile_version" => 1, "display_name" => "Once"}
    body = Yawp.Federation.Wrapper.encode_body(inner, sender_anchor_id: @sender_anchor)
    url = "http://#{peer(@anchor_b_port)}/federation/ppe/push"

    headers = [{"content-type", "application/json"}]

    assert {:ok, %Req.Response{status: 200}} = Req.post(url: url, body: body, headers: headers)
    assert {:ok, %Req.Response{status: 409}} = Req.post(url: url, body: body, headers: headers)
  end
end
