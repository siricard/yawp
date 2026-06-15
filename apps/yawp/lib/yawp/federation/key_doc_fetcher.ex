defmodule Yawp.Federation.KeyDocFetcher do
  @moduledoc false

  alias Yawp.Federation.KeyDocCache
  alias Yawp.Federation.InsecurePeerHosts

  require Logger

  @well_known_path "/.well-known/yawp/server-key.json"

  @spec get!(KeyDocCache.host()) :: KeyDocCache.key_doc()
  def get!(host) do
    case KeyDocCache.get(host) do
      {:ok, {doc, _fetched_at, _ttl}} ->
        emit(:hit, host)
        doc

      status when status in [:miss, :stale] ->
        emit(status_event(status), host)
        fetch_and_cache!(host)
    end
  end

  @spec verify_with(KeyDocCache.host(), String.t(), iodata(), binary()) :: boolean()
  def verify_with(host, key_id, message, signature) do
    doc = get!(host)

    case find_usable_key(doc, key_id) do
      {:ok, public_key} ->
        ed25519_verify(message, signature, public_key)

      :not_found ->
        case refetch_for_unknown_key(host, doc, key_id) do
          {:ok, public_key} -> ed25519_verify(message, signature, public_key)
          :not_found -> false
        end
    end
  end

  defp refetch_for_unknown_key(host, current_doc, key_id) do
    emit(:forced_refetch, host)
    fresh = fetch_and_cache!(host)

    if fresh == current_doc do
      :not_found
    else
      find_usable_key(fresh, key_id)
    end
  end

  defp fetch_and_cache!(host) do
    url = "#{scheme(host)}://#{host}#{@well_known_path}"
    response = Req.get!([url: url] ++ req_options())
    doc = response.body
    ttl = ttl_from(response, doc)
    KeyDocCache.put(host, doc, ttl)
    doc
  end

  defp ttl_from(response, _doc) do
    cap = KeyDocCache.default_ttl_seconds()

    with [value | _] <- Req.Response.get_header(response, "cache-control"),
         %{"max_age" => max_age} <- Regex.named_captures(~r/max-age=(?<max_age>\d+)/, value),
         {seconds, ""} when seconds > 0 <- Integer.parse(max_age) do
      min(seconds, cap)
    else
      _ -> cap
    end
  end

  defp find_usable_key(doc, key_id) do
    revoked = Map.get(doc, "revoked", [])
    keys = Map.get(doc, "keys", [])

    cond do
      key_id in revoked ->
        :not_found

      true ->
        entry = Enum.find(keys, fn k -> Map.get(k, "key_id") == key_id end)

        with %{} = entry <- entry,
             true <- within_validity_window?(entry),
             {:ok, public_key} <- decode_public_key(Map.get(entry, "public_key")) do
          {:ok, public_key}
        else
          _ -> :not_found
        end
    end
  end

  defp within_validity_window?(entry) do
    now = DateTime.utc_now()

    after_not_before?(Map.get(entry, "not_before"), now) and
      before_not_after?(Map.get(entry, "not_after"), now)
  end

  defp after_not_before?(nil, _now), do: true

  defp after_not_before?(value, now) do
    case DateTime.from_iso8601(value) do
      {:ok, not_before, _} -> DateTime.compare(now, not_before) != :lt
      _ -> false
    end
  end

  defp before_not_after?(nil, _now), do: true

  defp before_not_after?(value, now) do
    case DateTime.from_iso8601(value) do
      {:ok, not_after, _} -> DateTime.compare(now, not_after) != :gt
      _ -> false
    end
  end

  defp decode_public_key(nil), do: :error

  defp decode_public_key(value) do
    raw = String.replace_prefix(value, "ed25519:", "")

    decoded =
      case Base.url_decode64(raw, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(raw, padding: false)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == 32 -> {:ok, bytes}
      _ -> :error
    end
  end

  defp ed25519_verify(message, signature, public_key) do
    :crypto.verify(:eddsa, :none, message, signature, [public_key, :ed25519])
  rescue
    _ -> false
  end

  defp status_event(:miss), do: :miss
  defp status_event(:stale), do: :miss

  defp emit(event, host) do
    :telemetry.execute([:yawp, :federation, :key_doc, event], %{count: 1}, %{host: host})
  end

  defp scheme(host) do
    if InsecurePeerHosts.insecure?(host) do
      "http"
    else
      "https"
    end
  end

  defp req_options do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get(:req_options, [])
  end
end
