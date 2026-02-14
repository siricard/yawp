defmodule YawpWeb.ChannelCase do
  @moduledoc """
  Test case for Phoenix Channel tests. Brings in `Phoenix.ChannelTest` helpers
  and sets up the Ecto sandbox for tests that hit the data layer.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
            @endpoint YawpWeb.Endpoint

            import Phoenix.ChannelTest
      import YawpWeb.ChannelCase
    end
  end

  setup tags do
    Yawp.DataCase.setup_sandbox(tags)
    :ok
  end
end
