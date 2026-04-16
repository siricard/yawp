defmodule Yawp.Identity.SessionToken.Changes.MintToken do
  @moduledoc """
  generates a 128-bit random opaque token (16 random bytes,
  base64url-encoded without padding → 22 chars) and stamps the
  default-TTL expiry.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    token =
      :crypto.strong_rand_bytes(16)
      |> Base.url_encode64(padding: false)

    expires_at =
      DateTime.utc_now()
      |> DateTime.add(Yawp.Identity.SessionToken.ttl_seconds(), :second)

    changeset
    |> Ash.Changeset.force_change_attribute(:token, token)
    |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
  end
end
