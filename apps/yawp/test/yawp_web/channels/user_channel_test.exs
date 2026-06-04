defmodule YawpWeb.UserChannelTest do
  use YawpWeb.ChannelCase, async: false

  alias Yawp.Federation
  alias Yawp.Identity
  alias YawpWeb.Presence

  defp seed_identity do
    {master_pk, _master_sk} = :crypto.generate_key(:eddsa, :ed25519)
    {device_pk, device_sk} = :crypto.generate_key(:eddsa, :ed25519)

    did = "did:yawp:" <> Identity.did_from_pubkey(master_pk)
    device_id = Ecto.UUID.generate()

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{
        did: did,
        master_public_key: master_pk,
        device_subkeys: %{
          "subkeys" => [
            %{
              "device_id" => device_id,
              "pk" => Base.url_encode64(device_pk, padding: false),
              "signature" => Base.url_encode64(<<0::64*8>>, padding: false),
              "issued_at" => DateTime.to_iso8601(DateTime.utc_now())
            }
          ]
        }
      })

    %{identity: identity, did: did, device_id: device_id, device_sk: device_sk}
  end

  defp bare(did), do: String.replace_prefix(did, "did:yawp:", "")

  defp join_user(actor, did, params \\ %{}) do
    YawpWeb.UserSocket
    |> Phoenix.ChannelTest.socket(
      "identity_socket:#{actor.identity.id}-#{System.unique_integer([:positive])}",
      %{current_identity: actor.identity}
    )
    |> subscribe_and_join(YawpWeb.UserChannel, "user:#{bare(did)}", params)
  end

  describe "join authorization" do
    test "the owner of the DID joins and is tracked in presence" do
      actor = seed_identity()

      assert {:ok, _reply, socket} = join_user(actor, actor.did)
      assert_push "presence_state", state
      assert Map.has_key?(state, bare(actor.did))
      assert socket.assigns.did == bare(actor.did)
    end

    test "joining another identity's user topic is rejected" do
      actor = seed_identity()
      other = seed_identity()

      assert {:error, %{reason: "unauthorized"}} = join_user(actor, other.did)
    end

    test "an unparsable user topic is rejected" do
      actor = seed_identity()

      result =
        YawpWeb.UserSocket
        |> Phoenix.ChannelTest.socket("identity_socket:#{actor.identity.id}", %{
          current_identity: actor.identity
        })
        |> subscribe_and_join(YawpWeb.UserChannel, "user:")

      assert {:error, %{reason: "unauthorized"}} = result
    end
  end

  describe "inbox push" do
    test "an envelope appended to the joined user's inbox is pushed as an inbox event" do
      actor = seed_identity()
      assert {:ok, _reply, _socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      envelope = %{
        "envelope_id" => Ecto.UUID.generate(),
        "conversation_id" => "conv-1",
        "kind" => "dm",
        "recipient_did" => actor.did,
        "body" => "hello"
      }

      {:ok, _entry} = Federation.append_inbox(actor.did, envelope)

      assert_push "inbox", pushed
      assert pushed.envelope_id == envelope["envelope_id"]
      assert pushed.conversation_id == "conv-1"
      assert pushed.kind == "dm"
      assert pushed.envelope == envelope
    end

    test "an envelope for a different recipient is not pushed to this user" do
      actor = seed_identity()
      other = seed_identity()
      assert {:ok, _reply, _socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      envelope = %{
        "envelope_id" => Ecto.UUID.generate(),
        "kind" => "dm",
        "recipient_did" => other.did
      }

      {:ok, _entry} = Federation.append_inbox(other.did, envelope)

      refute_push "inbox", _
    end
  end

  describe "delivery_ack" do
    test "a well-formed delivery_ack is accepted and broadcast on the topic" do
      actor = seed_identity()
      assert {:ok, _reply, socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      ref =
        push(socket, "delivery_ack", %{
          "envelope_id" => "env-1",
          "conversation_id" => "conv-1",
          "signed_by" => actor.device_id,
          "signature" => "sig",
          "ts" => System.system_time(:millisecond)
        })

      assert_reply ref, :ok
      assert_broadcast "delivery_ack", %{envelope_id: "env-1"}
    end

    test "a malformed delivery_ack is rejected" do
      actor = seed_identity()
      assert {:ok, _reply, socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      ref = push(socket, "delivery_ack", %{"envelope_id" => "env-1"})
      assert_reply ref, :error, %{reason: "invalid_payload"}
    end
  end

  describe "read_marker" do
    test "a well-formed read_marker is accepted and broadcast on the topic" do
      actor = seed_identity()
      assert {:ok, _reply, socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      ref =
        push(socket, "read_marker", %{
          "conversation_id" => "conv-1",
          "up_to_serial" => 7,
          "signed_by" => actor.device_id,
          "signature" => "sig",
          "ts" => System.system_time(:millisecond)
        })

      assert_reply ref, :ok
      assert_broadcast "read_marker", %{conversation_id: "conv-1", up_to_serial: 7}
    end

    test "a malformed read_marker is rejected" do
      actor = seed_identity()
      assert {:ok, _reply, socket} = join_user(actor, actor.did)
      assert_push "presence_state", _

      ref = push(socket, "read_marker", %{"conversation_id" => "conv-1"})
      assert_reply ref, :error, %{reason: "invalid_payload"}
    end
  end

  describe "federated presence subscription on client open" do
    setup do
      test = self()
      Req.Test.set_req_test_to_shared()
      {:ok, _} = Federation.generate_server_key()

      prev = Application.get_env(:yawp, Federation.Client)

      Application.put_env(:yawp, Federation.Client,
        anchor_id: "home.example",
        req_options: [plug: {Req.Test, __MODULE__}]
      )

      Req.Test.stub(__MODULE__, fn conn ->
        send(test, {:notify_posted, conn.request_path})
        Req.Test.json(conn, %{"status" => "noted"})
      end)

      on_exit(fn ->
        if prev do
          Application.put_env(:yawp, Federation.Client, prev)
        else
          Application.delete_env(:yawp, Federation.Client)
        end
      end)

      :ok
    end

    test "joining with guest anchors subscribes those peers in the presence broker" do
      actor = seed_identity()

      assert {:ok, _reply, _socket} =
               join_user(actor, actor.did, %{"guest_anchors" => ["peer-guest.example"]})

      assert_push "presence_state", _
      assert_receive {:notify_posted, "/federation/presence/notify"}, 2000
    end

    test "joining with no guest anchors posts no presence notify" do
      actor = seed_identity()

      assert {:ok, _reply, _socket} = join_user(actor, actor.did)
      assert_push "presence_state", _
      refute_receive {:notify_posted, _}, 500
    end
  end

  describe "presence" do
    test "two devices for the same identity both appear in the presence roster" do
      actor = seed_identity()

      assert {:ok, _reply, _socket_a} = join_user(actor, actor.did)
      assert_push "presence_state", _

      assert {:ok, _reply, _socket_b} = join_user(actor, actor.did)
      assert_push "presence_state", _

      metas = Presence.list("user:#{bare(actor.did)}")[bare(actor.did)][:metas]
      assert length(metas) == 2
    end
  end
end
