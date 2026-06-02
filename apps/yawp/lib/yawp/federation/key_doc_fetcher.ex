defmodule Yawp.Federation.KeyDocFetcher do
  @moduledoc """
  Fetches, caches, and verifies signatures against a peer anchor's
  server-key document.

  `get!/1` returns the cached document while it is fresh and otherwise
  fetches `https://<host>/.well-known/yawp/server-key.json` over HTTPS,
  parses it, and caches it under the default 24h TTL. `verify_with/4`
  resolves the key referenced by `key_id`, forcing an immediate refetch
  when that key is absent from the cached document (a freshly-rotated
  key), and returns the Ed25519 verification result.

  Cache hits, misses, and forced refetches emit telemetry under
  `[:yawp, :federation, :key_doc, _]` with a `%{count: 1}` measurement
  and `%{host: host}` metadata.
  """

  alias Yawp.Federation.KeyDocCache

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
    url = "https://#{host}#{@well_known_path}"
    response = Req.get!([url: url] ++ req_options())
    doc = response.body
    ttl = ttl_from(response, doc)
    KeyDocCache.put(host, doc, ttl)
    doc
  end

  defp ttl_from(response, _doc) do
    with [value | _] <- Req.Response.get_header(response, "cache-control"),
         %{"max-age" => max_age} <- Regex.named_captures(~r/max-age=(?<max_age>\d+)/, value),
         {seconds, ""} when seconds > 0 <- Integer.parse(max_age) do
      seconds
    else
      _ -> KeyDocCache.default_ttl_seconds()
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
             {:ok, public_key} <- decode_public_key(Map.get(entry, "public_key")) do
          {:ok, public_key}
        else
          _ -> :not_found
        end
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

  defp req_options do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get(:req_options, [])
  end
end
