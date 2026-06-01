defmodule Yawp.Servers.Changes.ApplyModeration do
  @moduledoc """
  Shared side-effect change for the `Kick` and `Ban` create actions.

  Pass the membership flag to set via the `:flag` option (`:kicked` or
  `:banned`):

      change Yawp.Servers.Changes.ApplyModeration, flag: :kicked

  Before the write it stamps the moderator id (`kicked_by_identity_id` /
  `banned_by_identity_id`) from the Ash actor. After the event row is
  inserted it flips the matching flag on the target membership. For a
  kick it additionally revokes every session + refresh token the kicked
  identity holds, immediately invalidating their authenticated sessions.
  """
  use Ash.Resource.Change

  require Ash.Query

  @impl true
  def init(opts) do
    case Keyword.get(opts, :flag) do
      flag when flag in [:kicked, :banned] -> {:ok, opts}
      _ -> {:error, "ApplyModeration requires :flag to be :kicked or :banned"}
    end
  end

  @impl true
  def change(changeset, opts, context) do
    flag = Keyword.fetch!(opts, :flag)
    actor = context_actor(context)

    changeset
    |> stamp_moderator(flag, actor)
    |> Ash.Changeset.after_action(fn _changeset, record ->
      apply_flag(record, flag)
      maybe_revoke(record, flag)
      {:ok, record}
    end)
  end

  defp stamp_moderator(changeset, _flag, %Yawp.Identity.Identity{id: nil}), do: changeset

  defp stamp_moderator(changeset, :kicked, %Yawp.Identity.Identity{id: id}),
    do: Ash.Changeset.force_change_attribute(changeset, :kicked_by_identity_id, id)

  defp stamp_moderator(changeset, :banned, %Yawp.Identity.Identity{id: id}),
    do: Ash.Changeset.force_change_attribute(changeset, :banned_by_identity_id, id)

  defp stamp_moderator(changeset, _flag, _actor), do: changeset

  defp apply_flag(record, flag) do
    case fetch_membership(record.identity_id, record.server_id) do
      nil ->
        :ok

      membership ->
        membership
        |> Ash.Changeset.for_update(:set_moderation, %{flag => true})
        |> Ash.update!(authorize?: false)

        :ok
    end
  end

  defp maybe_revoke(record, :kicked) do
    Yawp.Identity.revoke_all_for_identity(record.identity_id)
    :ok
  end

  defp maybe_revoke(_record, _flag), do: :ok

  defp fetch_membership(identity_id, server_id) do
    Yawp.Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> List.first()
  end

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil
end
