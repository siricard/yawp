defmodule Yawp.Servers do
  @moduledoc """
  Ash domain for the server / channel / membership graph.

   leaves this domain intentionally empty — it exists so that
  config-level `ash_domains` settles into its post- shape now,
  before subsequent M7.x milestones land the `Server`, `Membership`,
  `Role`, `Channel`, `Message`, `Invite`, `Ban`, `Kick`, and
  `Attachment` resources.
  """

  use Ash.Domain, otp_app: :yawp

  resources do
  end
end
