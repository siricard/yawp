defmodule Yawp.Identity.Identity.Changes.AppendDeviceSubkey do
  @moduledoc """
  idempotent append on `device_subkeys.subkeys`. First-write-wins
  on `device_id`: re-binding the SAME device_id preserves the existing
  entry; binding a NEW device_id appends. Stashes
  `:already_bound?` on the context for downstream changes
  (`BumpProfileVersion`).
  """
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &apply/1)
  end

  defp apply(%{valid?: false} = changeset), do: changeset

  defp apply(changeset) do
    device_id = Ash.Changeset.get_argument(changeset, :device_id)
    device_pk_b64 = Ash.Changeset.get_argument(changeset, :device_pk)
    device_sig_b64 = Ash.Changeset.get_argument(changeset, :device_signature)

    issued_at_iso =
      changeset
      |> Ash.Changeset.get_argument(:issued_at)
      |> DateTime.to_iso8601()

    existing = Ash.Changeset.get_attribute(changeset, :device_subkeys) || %{"subkeys" => []}
    subkeys = Map.get(existing, "subkeys", [])

    already_bound? = Enum.any?(subkeys, fn s -> Map.get(s, "device_id") == device_id end)

    new_subkeys =
      if already_bound? do
        subkeys
      else
        subkeys ++
          [
            %{
              "device_id" => device_id,
              "pk" => device_pk_b64,
              "signature" => device_sig_b64,
              "issued_at" => issued_at_iso
            }
          ]
      end

    changeset
    |> Ash.Changeset.put_context(:already_bound?, already_bound?)
    |> Ash.Changeset.force_change_attribute(:device_subkeys, %{"subkeys" => new_subkeys})
  end
end
