defmodule Yawp.Servers.Permissions do
  @moduledoc """
  The permission-bit registry and effective-permission resolver for the
  server RBAC graph.

  Permissions are atomic, named bits stored as a 64-bit integer on each
  role (`permission_bits`) and on each channel override (`allow_bits` /
  `deny_bits`). The resolver walks the role-and-override graph to produce
  the effective bitmask a given identity holds in a given channel.

  ## Resolution order

  For `effective_bits(identity, server, channel)`:

  1. **Server owner** short-circuits to `all_bits/0`.
  2. A **banned** or **kicked** membership short-circuits to `0`.
  3. **No membership** resolves to `0`.
  4. Otherwise: union the `permission_bits` of every assigned role to form
     the server-level baseline.
  5. If a channel is given, layer the channel overrides on top in two
     precedence tiers — role-level overrides first, then identity-level
     overrides — so a per-identity grant can re-open access that a
     role-level deny had closed (the private-channel case). Within a tier
     the mask becomes `(mask ||| allow) &&& ~deny` (deny wins ties); the
     identity tier is applied after the role tier and therefore wins.
  """

  import Bitwise

  require Ash.Query

  @bits %{
    read_messages: 1 <<< 0,
    send_messages: 1 <<< 1,
    manage_messages: 1 <<< 2,
    manage_channels: 1 <<< 3,
    manage_roles: 1 <<< 4,
    kick_members: 1 <<< 5,
    ban_members: 1 <<< 6,
    create_invite: 1 <<< 7,
    read_history_before_join: 1 <<< 8,
    mention_everyone: 1 <<< 9,
    mention_role: 1 <<< 10,
    add_reactions: 1 <<< 11,
    delete_server: 1 <<< 12,
    transfer_ownership: 1 <<< 13,
    voice_speak: 1 <<< 14,
    voice_listen: 1 <<< 15
  }

  @owner_only [:delete_server, :transfer_ownership]

  @member_grants [
    :read_messages,
    :send_messages,
    :read_history_before_join,
    :add_reactions,
    :create_invite,
    :voice_speak,
    :voice_listen
  ]

  @type name :: atom()

  @doc "All named permission bits, in registry order."
  @spec names() :: [name()]
  def names, do: Map.keys(@bits)

  @doc "The integer value of a single named bit."
  @spec bit(name()) :: non_neg_integer()
  def bit(name) when is_atom(name), do: Map.fetch!(@bits, name)

  @doc "The bitmask covering every named permission."
  @spec all_bits() :: non_neg_integer()
  def all_bits do
    Enum.reduce(@bits, 0, fn {_name, value}, acc -> acc ||| value end)
  end

  @doc "The bitmask of owner-only permissions (`delete_server`, `transfer_ownership`)."
  @spec owner_only_bits() :: non_neg_integer()
  def owner_only_bits do
    Enum.reduce(@owner_only, 0, fn name, acc -> acc ||| bit(name) end)
  end

  @doc "Seeded Owner bitmask: every named permission."
  @spec owner_bits() :: non_neg_integer()
  def owner_bits, do: all_bits()

  @doc "Seeded Admin bitmask: every permission except the owner-only ones."
  @spec admin_bits() :: non_neg_integer()
  def admin_bits, do: all_bits() &&& bnot(owner_only_bits())

  @doc "Seeded Member bitmask: read/send, history, reactions, invites, voice."
  @spec member_bits() :: non_neg_integer()
  def member_bits do
    Enum.reduce(@member_grants, 0, fn name, acc -> acc ||| bit(name) end)
  end

  @doc "Whether `mask` carries the named bit."
  @spec has?(non_neg_integer(), name()) :: boolean()
  def has?(mask, name) when is_integer(mask) and is_atom(name) do
    (mask &&& bit(name)) != 0
  end

  @doc """
  The effective permission bitmask for `identity` in `channel` on `server`.

  Pass `nil` for `channel` to compute the server-level baseline without
  channel overrides.
  """
  @spec effective_bits(
          Yawp.Identity.Identity.t(),
          Yawp.Servers.Server.t(),
          Yawp.Servers.Channel.t() | nil
        ) :: non_neg_integer()
  def effective_bits(identity, server, channel) do
    cond do
      owner?(identity, server) ->
        all_bits()

      true ->
        case fetch_membership(identity.id, server.id) do
          nil -> 0
          %{banned: true} -> 0
          %{kicked: true} -> 0
          membership -> resolve(membership, channel)
        end
    end
  end

  defp owner?(%{did: did}, %{owner_did: owner_did})
       when is_binary(did) and is_binary(owner_did),
       do: did == owner_did

  defp owner?(_, _), do: false

  defp resolve(membership, channel) do
    baseline = baseline_bits(membership.role_ids)

    case channel do
      nil -> baseline
      %{id: channel_id} -> apply_overrides(baseline, channel_id, membership)
    end
  end

  defp baseline_bits([]), do: 0

  defp baseline_bits(role_ids) when is_list(role_ids) do
    Yawp.Servers.Role
    |> Ash.Query.filter(id in ^role_ids)
    |> Ash.read!(authorize?: false)
    |> Enum.reduce(0, fn role, acc -> acc ||| role.permission_bits end)
  end

  defp apply_overrides(baseline, channel_id, membership) do
    overrides =
      Yawp.Servers.ChannelOverride
      |> Ash.Query.filter(channel_id == ^channel_id)
      |> Ash.read!(authorize?: false)

    role_set = MapSet.new(membership.role_ids)

    role_overrides =
      Enum.filter(overrides, fn ov ->
        ov.role_id != nil and MapSet.member?(role_set, ov.role_id)
      end)

    identity_overrides =
      Enum.filter(overrides, fn ov -> ov.identity_id == membership.identity_id end)

    baseline
    |> apply_level(role_overrides)
    |> apply_level(identity_overrides)
  end

  defp apply_level(mask, []), do: mask

  defp apply_level(mask, overrides) do
    allow = Enum.reduce(overrides, 0, fn ov, acc -> acc ||| ov.allow_bits end)
    deny = Enum.reduce(overrides, 0, fn ov, acc -> acc ||| ov.deny_bits end)

    (mask ||| allow) &&& bnot(deny)
  end

  defp fetch_membership(identity_id, server_id) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> List.first()
  end
end
