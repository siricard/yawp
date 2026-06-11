defmodule Yawp.Servers.RetentionSweepJob do
  @moduledoc false

  use Oban.Worker, queue: :default, max_attempts: 3

  import Ecto.Query

  @impl Oban.Worker
  def perform(%Oban.Job{args: args}) do
    now = now_from_args(args)

    channels_with_retention()
    |> Enum.each(&sweep_channel(&1, now))

    :ok
  end

  defp now_from_args(%{"now_ms" => now_ms}) when is_integer(now_ms) do
    DateTime.from_unix!(now_ms * 1000, :microsecond)
  end

  defp now_from_args(_args), do: DateTime.utc_now() |> DateTime.truncate(:microsecond)

  defp channels_with_retention do
    query =
      from c in Yawp.Servers.Channel,
        join: s in Yawp.Servers.Server,
        on: s.id == c.server_id,
        select: %{
          channel_id: c.id,
          retention: fragment("COALESCE(?, ?)", c.retention, s.retention),
          retention_duration_ms:
            fragment("COALESCE(?, ?)", c.retention_duration_ms, s.retention_duration_ms)
        }

    Yawp.Repo.all(query)
    |> Enum.filter(&finite_retention?/1)
  end

  defp finite_retention?(%{retention: :duration_ms, retention_duration_ms: ms})
       when is_integer(ms) and ms > 0,
       do: true

  defp finite_retention?(%{retention: "duration_ms", retention_duration_ms: ms})
       when is_integer(ms) and ms > 0,
       do: true

  defp finite_retention?(_channel), do: false

  defp sweep_channel(channel, now) do
    cutoff = DateTime.add(now, -channel.retention_duration_ms, :millisecond)

    channel.channel_id
    |> old_messages_without_tombstones(cutoff)
    |> Enum.each(&tombstone_message(&1, now))
  end

  defp old_messages_without_tombstones(channel_id, cutoff) do
    from(m in Yawp.Servers.Message,
      left_join: t in Yawp.Servers.MessageTombstone,
      on: t.message_id == m.id,
      where:
        m.channel_id == ^channel_id and m.server_inserted_at < ^cutoff and not is_nil(m.body) and
          is_nil(t.id),
      select: %{id: m.id}
    )
    |> Yawp.Repo.all()
  end

  defp tombstone_message(message, now) do
    ts = DateTime.to_unix(now, :millisecond)
    actor_did = "server"

    envelope = %{
      "message_id" => message.id,
      "reason" => "retention",
      "actor_did" => actor_did,
      "ts" => ts
    }

    with {:ok, signature, signed_by} <- sign_retention(envelope) do
      Yawp.Repo.transaction(fn ->
        {1, _} =
          Yawp.Repo.update_all(
            from(m in Yawp.Servers.Message, where: m.id == ^message.id and not is_nil(m.body)),
            set: [body: nil]
          )

        Yawp.Repo.insert_all(Yawp.Servers.MessageTombstone, [
          %{
            id: Ecto.UUID.generate(),
            message_id: message.id,
            reason: :retention,
            actor_did: actor_did,
            signature: signature,
            signed_by: signed_by,
            inserted_at: now
          }
        ])
      end)
    end
  end

  defp sign_retention(envelope) do
    case Yawp.Federation.sign(envelope) do
      {:ok, signature, signed_by} ->
        {:ok, signature, signed_by}

      {:error, :no_active_key} ->
        :ok = Yawp.Federation.ensure_active_server_key!()
        Yawp.Federation.sign(envelope)
    end
  end
end
