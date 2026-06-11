defmodule Yawp.Servers.Message.Search do
  @moduledoc false

  use Ash.Resource.Actions.Implementation

  require Ash.Query

  alias Yawp.Repo
  alias Yawp.Servers
  alias Yawp.Servers.Permissions

  @impl true
  def run(input, _opts, context) do
    actor = context.actor
    %{server_id: server_id, query: query, limit: limit} = input.arguments
    server_id = normalize_uuid(server_id)

    with {:ok, actor} <- require_actor(actor),
         {:ok, server} <- get_server(server_id) do
      messages =
        server_id
        |> matching_ids(query, limit)
        |> load_messages()
        |> Enum.filter(&visible?(&1, actor, server))

      {:ok, messages}
    end
  end

  defp require_actor(nil), do: {:error, Yawp.RpcError.exception(type: "unauthorized")}
  defp require_actor(actor), do: {:ok, actor}

  defp get_server(server_id) do
    case Ash.get(Servers.Server, server_id, authorize?: false) do
      {:ok, server} -> {:ok, server}
      {:error, _error} -> {:error, Yawp.RpcError.exception(type: "server_not_found")}
    end
  end

  defp matching_ids(server_id, query, limit) do
    sql = """
    select m.id
    from server_messages m
    join server_channels c on c.id = m.channel_id
    where c.server_id::text = $1
      and m.search_vector @@ websearch_to_tsquery('simple', $2)
    order by ts_rank(m.search_vector, websearch_to_tsquery('simple', $2)) desc,
             m.server_inserted_at desc
    limit $3
    """

    %{rows: rows} = Repo.query!(sql, [server_id, query, limit])
    Enum.map(rows, fn [id] -> normalize_uuid(id) end)
  end

  defp normalize_uuid(<<_::128>> = uuid), do: Ecto.UUID.load!(uuid)
  defp normalize_uuid(uuid), do: uuid

  defp load_messages([]), do: []

  defp load_messages(ids) do
    by_id =
      Servers.Message
      |> Ash.Query.filter(id in ^ids)
      |> Ash.Query.load(:channel)
      |> Ash.read!(authorize?: false)
      |> Map.new(&{&1.id, &1})

    Enum.flat_map(ids, fn id ->
      case Map.fetch(by_id, id) do
        {:ok, message} -> [message]
        :error -> []
      end
    end)
  end

  defp visible?(message, actor, server) do
    channel = message.channel
    bits = Permissions.effective_bits(actor, server, channel)

    Permissions.has?(bits, :read_messages) and
      (Permissions.has?(bits, :read_history_before_join) or
         visible_after_join?(actor, server, message))
  end

  defp visible_after_join?(actor, server, message) do
    case membership(actor.id, server.id) do
      nil -> false
      %{joined_at: joined_at} -> DateTime.compare(message.inserted_at, joined_at) != :lt
    end
  end

  defp membership(identity_id, server_id) do
    Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> List.first()
  end
end
