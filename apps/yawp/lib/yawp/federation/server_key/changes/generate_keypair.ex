defmodule Yawp.Federation.ServerKey.Changes.GenerateKeypair do
  @moduledoc """
  Generates a fresh Ed25519 keypair and writes it into the changeset.
  Used by the `:generate` create action so keypair creation runs
  through the standard Ash pipeline (policies, validations, audit).
  """
  use Ash.Resource.Change

  @default_window_days 365

  @impl true
  def change(changeset, _opts, _context) do
    {public_key, private_key} = :crypto.generate_key(:eddsa, :ed25519)
    now = DateTime.utc_now()

    not_before = Ash.Changeset.get_argument(changeset, :not_before) || now

    not_after =
      Ash.Changeset.get_argument(changeset, :not_after) ||
        DateTime.add(now, @default_window_days * 86_400, :second)

    key_id =
      Ash.Changeset.get_argument(changeset, :key_id) ||
        derive_key_id(public_key)

    changeset
    |> Ash.Changeset.force_change_attribute(:key_id, key_id)
    |> Ash.Changeset.force_change_attribute(:public_key, public_key)
    |> Ash.Changeset.force_change_attribute(:not_before, not_before)
    |> Ash.Changeset.force_change_attribute(:not_after, not_after)
    |> AshCloak.encrypt_and_set(:private_key, private_key)
  end

  defp derive_key_id(public_key) do
    short_hash =
      :crypto.hash(:sha256, public_key)
      |> binary_part(0, 6)
      |> Base.encode16(case: :lower)

    "k-#{Date.to_iso8601(Date.utc_today())}-#{short_hash}"
  end
end
