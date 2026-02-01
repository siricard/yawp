defmodule MookWeb.TestChannel do
  @moduledoc """
  Test-only stub channel used by the cross-channel auth tests to verify
  that `socket.assigns.current_did` is set at the SOCKET level (via
  `MookWeb.UserSocket.connect/3`) and therefore propagates to every
  channel joined over that socket.

  Defined under `test/support/` and only compiled in the test environment
  (`elixirc_paths(:test)` in `mix.exs`). The channel is not declared in
  `MookWeb.UserSocket` because `Phoenix.ChannelTest.subscribe_and_join/4`
  joins channel modules directly, regardless of the socket's `channel`
  declarations.
  """

  use Phoenix.Channel

  @impl true
  def join("test:" <> _id, _params, socket) do
    {:ok, socket}
  end
end
