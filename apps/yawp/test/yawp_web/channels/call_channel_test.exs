defmodule YawpWeb.CallChannelTest do
  @moduledoc """
  Covers `YawpWeb.CallChannel` (topic `call:<peer_did>`):

    * Unauthenticated socket (no `current_did` assigned) → `:unauthorized`.
    * Authenticated socket joins on the callee's DID topic.
    * Two-client offer/answer/ICE handshake:
        - A (caller) joins `call:<bob_did>`; B (callee) also joins
          `call:<bob_did>` (the receiver listens on their own topic).
        - A pushes `offer`; B receives broadcast.
        - B pushes `answer`; A receives broadcast.
        - Both push `ice`; both receive each other's candidates.

  See `srv-M5-04` and `srv-M5-05` in the validation contract.
  """

  use YawpWeb.ChannelCase, async: false

  alias YawpWeb.CallChannel
  alias YawpWeb.UserSocket

  @did_alice "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
  @did_bob "5jKZxYAwbcQbeKHkVTYJYNqyZxGRH8X2t9MnoVfbsoXg"

  defp join_as(did, peer_did) do
    socket = socket(UserSocket, nil, %{current_did: did})
    subscribe_and_join(socket, CallChannel, "call:#{peer_did}", %{})
  end

  describe "join/3" do
    test "rejects join when socket has no current_did → :unauthorized" do
      socket = socket(UserSocket, nil, %{})

      assert {:error, %{reason: :unauthorized}} =
               subscribe_and_join(socket, CallChannel, "call:#{@did_bob}", %{})
    end

    test "accepts join for an authenticated socket targeting any peer DID" do
      assert {:ok, _reply, socket} = join_as(@did_alice, @did_bob)
      assert socket.assigns.current_did == @did_alice
      assert socket.assigns.peer_did == @did_bob
    end

    test "accepts join when the caller is ringing themselves" do
            assert {:ok, _reply, _socket} = join_as(@did_alice, @did_alice)
    end
  end

  describe "two-client offer/answer/ICE handshake" do
    test "A pushes offer, B receives; B pushes answer, A receives; both push ice; both receive" do
            {:ok, _reply, socket_a} = join_as(@did_alice, @did_bob)
            {:ok, _reply, socket_b} = join_as(@did_bob, @did_bob)

                              alice_did = @did_alice
      bob_did = @did_bob

            offer_sdp = %{"type" => "offer", "sdp" => "v=0\r\no=alice ..."}
      ref = push(socket_a, "offer", offer_sdp)
      assert_reply ref, :ok

      assert_broadcast "offer", %{from: ^alice_did, payload: ^offer_sdp}

            answer_sdp = %{"type" => "answer", "sdp" => "v=0\r\no=bob ..."}
      ref = push(socket_b, "answer", answer_sdp)
      assert_reply ref, :ok

      assert_broadcast "answer", %{from: ^bob_did, payload: ^answer_sdp}

            alice_ice = %{"candidate" => "candidate:1 1 UDP 1 1.2.3.4 4242 typ host"}
      ref = push(socket_a, "ice", alice_ice)
      assert_reply ref, :ok

      assert_broadcast "ice", %{from: ^alice_did, payload: ^alice_ice}

            bob_ice = %{"candidate" => "candidate:2 1 UDP 1 5.6.7.8 4243 typ host"}
      ref = push(socket_b, "ice", bob_ice)
      assert_reply ref, :ok

      assert_broadcast "ice", %{from: ^bob_did, payload: ^bob_ice}

            assert socket_a.assigns.current_did == @did_alice
      assert socket_b.assigns.current_did == @did_bob
      assert socket_a.assigns.peer_did == @did_bob
      assert socket_b.assigns.peer_did == @did_bob
    end
  end

  describe "invalid payloads" do
    test "rejects offer without payload data" do
      {:ok, _reply, socket} = join_as(@did_alice, @did_bob)

      ref = push(socket, "offer", nil)
      assert_reply ref, :error, %{reason: :invalid_payload}
    end
  end
end
