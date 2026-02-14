defmodule YawpWeb.UserSocketTest do
  @moduledoc """
  Verifies the session-continuation flow described in
  `docs/` §"Session continuation after auth":

    1. Client authenticates over `auth:lobby` and receives a Phoenix.Token
       in the reply.
    2. Client reconnects the socket with `?token=<token>` (or the
       equivalent connect param).
    3. The reconnected socket has `socket.assigns.current_did` set at the
       SOCKET level — which propagates to every channel subsequently
       joined over that socket.

  Channel assigns alone (set via `assign(socket, :current_did, did)` inside
  `AuthChannel.handle_in/3`) live only on the AuthChannel process and do
  NOT propagate. The token+reconnect flow is what M4/M5 channels will
  rely on to authorize joins.
  """

  use YawpWeb.ChannelCase, async: false

  alias Yawp.Accounts.User
  alias YawpWeb.AuthChannel
  alias YawpWeb.TestChannel
  alias YawpWeb.UserSocket

    @pubkey Base.decode16!(
            "03A107BFF3CE10BE1D70DD18E74BC09967E4D6309BA50D5F1DDC8664125531B8",
            case: :upper
          )
  @did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
  @sk_seed Base.decode16!(
             "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F",
             case: :upper
           )

  defp register_user(pubkey) do
    User
    |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey}, authorize?: false)
    |> Ash.create!()
  end

  describe "connect/3 with no token" do
    test "accepts unauthenticated connect; current_did is not assigned" do
      assert {:ok, socket} = UserSocket.connect(%{}, socket(UserSocket), %{})
      refute Map.has_key?(socket.assigns, :current_did)
    end
  end

  describe "connect/3 with token" do
    test "verifies a valid token and assigns current_did at the socket level" do
      token = Phoenix.Token.sign(YawpWeb.Endpoint, "user_did", @did)

      assert {:ok, socket} =
               UserSocket.connect(%{"token" => token}, socket(UserSocket), %{})

      assert socket.assigns.current_did == @did
    end

    test "rejects an invalid token (no assigns, but connect still ok)" do
      assert {:ok, socket} =
               UserSocket.connect(%{"token" => "garbage"}, socket(UserSocket), %{})

      refute Map.has_key?(socket.assigns, :current_did)
    end

    test "rejects an expired token (no assigns)" do
            token =
        Phoenix.Token.sign(YawpWeb.Endpoint, "user_did", @did,
          signed_at: System.system_time(:second) - 100_000
        )

      assert {:ok, socket} =
               UserSocket.connect(%{"token" => token}, socket(UserSocket), %{})

      refute Map.has_key?(socket.assigns, :current_did)
    end
  end

  describe "session continuation after auth" do
    setup do
      _user = register_user(@pubkey)
      :ok
    end

    test "authenticate reply includes a token; reconnect propagates current_did to a new channel" do
            auth_socket = socket(UserSocket, nil, %{})

      {:ok, %{"nonce" => nonce_b64}, joined_auth_socket} =
        subscribe_and_join(auth_socket, AuthChannel, "auth:lobby", %{})

      nonce = Base.decode64!(nonce_b64)
      signature = :crypto.sign(:eddsa, :sha512, nonce, [@sk_seed, :ed25519])

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(signature)
      }

      ref = push(joined_auth_socket, "authenticate", payload)
      assert_reply ref, :ok, reply
      assert reply.did == @did
      assert is_binary(reply.token)
      token = reply.token

            assert {:ok, new_socket} =
               UserSocket.connect(%{"token" => token}, socket(UserSocket), %{})

                  assert new_socket.assigns.current_did == @did

                  {:ok, _reply, room_socket} =
        subscribe_and_join(new_socket, TestChannel, "test:abc", %{})

      assert room_socket.assigns.current_did == @did
    end
  end
end
