defmodule Yawp.Servers.ServerInvite.Changes.MintToken do
  @moduledoc """
  generates a 128-bit random token (16 bytes → 26 char
  unpadded base32), sets the TTL from the action argument, and
  initializes `uses_remaining` based on `kind`:

    * `:single_use` — `uses_remaining` stays nil (the singleton
      `consumed_at` stamp is what marks consumption).
    * `:multi_use` — `uses_remaining` is the positive cap passed in.
      `ValidateMintKind` rejects nil / non-positive caps upstream.
  """

  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    kind = Ash.Changeset.get_argument(changeset, :kind) || :single_use
    ttl = Ash.Changeset.get_argument(changeset, :ttl_seconds) || 24 * 60 * 60
    uses_remaining = Ash.Changeset.get_argument(changeset, :uses_remaining)
    server_id = Ash.Changeset.get_argument(changeset, :server_id)
    created_by_identity_id = Ash.Changeset.get_argument(changeset, :created_by_identity_id)

    now = DateTime.utc_now()
    expires_at = DateTime.add(now, ttl, :second)

    token =
      :crypto.strong_rand_bytes(16)
      |> Base.encode32(padding: false)

    changeset
    |> Ash.Changeset.force_change_attribute(:token, token)
    |> Ash.Changeset.force_change_attribute(:kind, kind)
    |> Ash.Changeset.force_change_attribute(:uses_remaining, uses_remaining)
    |> Ash.Changeset.force_change_attribute(:expires_at, expires_at)
    |> Ash.Changeset.force_change_attribute(:server_id, server_id)
    |> Ash.Changeset.force_change_attribute(:created_by_identity_id, created_by_identity_id)
  end
end
