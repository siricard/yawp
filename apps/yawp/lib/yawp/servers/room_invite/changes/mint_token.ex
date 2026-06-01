defmodule Yawp.Servers.RoomInvite.Changes.MintToken do
  @moduledoc """
  Generates a 128-bit random token (16 bytes → 26-char unpadded
  base32), sets the TTL from the `ttl_seconds` argument, and initializes
  `uses_remaining` from `kind`:

    * `:single_use` — `uses_remaining` stays nil (the `consumed_at` stamp
      marks consumption).
    * `:multi_use` — `uses_remaining` is the positive cap; nil / non-
      positive caps are rejected by `ValidateMintKind`.
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    kind = Ash.Changeset.get_argument(changeset, :kind) || :single_use
    ttl = Ash.Changeset.get_argument(changeset, :ttl_seconds) || 24 * 60 * 60
    uses_remaining = Ash.Changeset.get_argument(changeset, :uses_remaining)

    expires_at = DateTime.add(DateTime.utc_now(), ttl, :second)

    token =
      :crypto.strong_rand_bytes(16)
      |> Base.encode32(padding: false)

    changeset
    |> Ash.Changeset.force_change_attribute(:token, token)
    |> Ash.Changeset.force_change_attribute(:kind, kind)
    |> Ash.Changeset.force_change_attribute(:uses_remaining, uses_remaining)
    |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
  end
end
