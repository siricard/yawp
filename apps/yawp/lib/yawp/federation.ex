defmodule Yawp.Federation do
  @moduledoc """
  Ash domain for the federation surface — anchor server keypair, signed
  delivery wrapper, anchor-to-anchor sync, presence broker, DM relay.

   leaves this domain intentionally empty. adds the
  `Yawp.Federation.ServerKey` resource and the `/.well-known` endpoint.
  Later + features land the signed wrappers, inbox push, and
  presence broker.

  See (anchor sync protocol) (federation routing) (server keypair).
  """

  use Ash.Domain, otp_app: :yawp

  resources do
  end
end
