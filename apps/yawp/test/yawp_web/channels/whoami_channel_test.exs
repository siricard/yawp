defmodule YawpWeb.WhoamiChannelTest do
  @moduledoc """
  Verifies the `whoami` channel — clients use it to confirm whether the
  token they presented at socket connect time was valid. See
  `lib/yawp_web/channels/whoami_channel.ex`.
  """

  use YawpWeb.ChannelCase, async: false

  alias YawpWeb.UserSocket
  alias YawpWeb.WhoamiChannel

  @did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"

  describe "join/3 with authenticated socket" do
    test "replies :ok with the current_did" do
      socket = socket(UserSocket, nil, %{current_did: @did})

      assert {:ok, %{did: @did}, _socket} =
               subscribe_and_join(socket, WhoamiChannel, "whoami", %{})
    end
  end

  describe "join/3 with unauthenticated socket" do
    test "replies :error with :unauthenticated reason when current_did is absent" do
      socket = socket(UserSocket, nil, %{})

      assert {:error, %{reason: :unauthenticated}} =
               subscribe_and_join(socket, WhoamiChannel, "whoami", %{})
    end
  end

  describe "end-to-end via UserSocket.connect" do
    test "valid token → whoami join succeeds with did" do
      token = Phoenix.Token.sign(YawpWeb.Endpoint, "user_did", @did)

      {:ok, connected_socket} =
        UserSocket.connect(%{"token" => token}, socket(UserSocket), %{})

      assert {:ok, %{did: @did}, _socket} =
               subscribe_and_join(connected_socket, WhoamiChannel, "whoami", %{})
    end

    test "garbage token → whoami join fails with :unauthenticated" do
      {:ok, connected_socket} =
        UserSocket.connect(%{"token" => "garbage"}, socket(UserSocket), %{})

      assert {:error, %{reason: :unauthenticated}} =
               subscribe_and_join(connected_socket, WhoamiChannel, "whoami", %{})
    end

    test "expired token → whoami join fails with :unauthenticated" do
            token =
        Phoenix.Token.sign(YawpWeb.Endpoint, "user_did", @did,
          signed_at: System.system_time(:second) - 100_000
        )

      {:ok, connected_socket} =
        UserSocket.connect(%{"token" => token}, socket(UserSocket), %{})

      assert {:error, %{reason: :unauthenticated}} =
               subscribe_and_join(connected_socket, WhoamiChannel, "whoami", %{})
    end

    test "no token → whoami join fails with :unauthenticated" do
      {:ok, connected_socket} = UserSocket.connect(%{}, socket(UserSocket), %{})

      assert {:error, %{reason: :unauthenticated}} =
               subscribe_and_join(connected_socket, WhoamiChannel, "whoami", %{})
    end
  end
end
