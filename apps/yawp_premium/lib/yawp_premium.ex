defmodule YawpPremium do
  @moduledoc """
  Proprietary premium tier for Yawp.

  This OTP app intentionally lives in a separate umbrella directory from
  `:yawp` (the AGPL-licensed core) so that future commercial,
  non-AGPL-compatible features can ship under a different license. See
  `/LICENSE.premium` for the planned licensing terms.

  Right now this app is empty — it exists only to lock in the umbrella
  layout so subsequent features can grow it without restructuring the repo
  again.
  """

  @doc """
  Placeholder so the module has at least one callable function until real
  premium features land.
  """
  def hello, do: :world
end
