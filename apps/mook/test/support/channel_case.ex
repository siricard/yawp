defmodule MookWeb.ChannelCase do
  @moduledoc """
  Test case for Phoenix Channel tests. Brings in `Phoenix.ChannelTest` helpers
  and sets up the Ecto sandbox for tests that hit the data layer.
  """

  use ExUnit.CaseTemplate

  using do
    quote do
            @endpoint MookWeb.Endpoint

            import Phoenix.ChannelTest
      import MookWeb.ChannelCase
    end
  end

  setup tags do
    Mook.DataCase.setup_sandbox(tags)
    :ok
  end
end
