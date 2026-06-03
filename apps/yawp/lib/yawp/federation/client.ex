defmodule Yawp.Federation.Client do
  @moduledoc """
  Outbound anchor-to-anchor federation client.

  Each helper wraps an inner payload in a signed delivery wrapper
  (`Yawp.Federation.Wrapper`) using this anchor's active server key,
  then POSTs it to the peer anchor's matching `/federation/*` endpoint
  over `Req`. The peer verifies the wrapper signature against this
  anchor's published key document before applying the payload.

  All helpers take `(peer_host, payload)` and return
  `{:ok, response_body} | {:error, term()}`. The peer host is a bare
  hostname (e.g. `"anchor-b.example.com"` or `"localhost:14100"`); the
  scheme and path are filled in here.
  """

  alias Yawp.Federation.Wrapper

  @default_timeout 10_000

  @spec push_ppe!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_ppe!(peer_host, ppe) when is_binary(peer_host) and is_map(ppe) do
    post(peer_host, "/federation/ppe/push", ppe)
  end

  @spec push_blob!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_blob!(peer_host, blob) when is_binary(peer_host) and is_map(blob) do
    post(peer_host, "/federation/blob/push", blob)
  end

  @spec push_inbox!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_inbox!(peer_host, envelope) when is_binary(peer_host) and is_map(envelope) do
    post(peer_host, "/federation/inbox/push", envelope)
  end

  @spec adopt!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def adopt!(peer_host, adoption) when is_binary(peer_host) and is_map(adoption) do
    post(peer_host, "/federation/anchors/adopt", adoption)
  end

  @spec push_devices_changed!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_devices_changed!(peer_host, change) when is_binary(peer_host) and is_map(change) do
    post(peer_host, "/federation/devices/changed", change)
  end

  @spec subscribe_presence!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def subscribe_presence!(peer_host, subscription)
      when is_binary(peer_host) and is_map(subscription) do
    post(peer_host, "/federation/presence/subscribe", subscription)
  end

  @spec notify_presence!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def notify_presence!(peer_host, notification)
      when is_binary(peer_host) and is_map(notification) do
    post(peer_host, "/federation/presence/notify", notification)
  end

  @spec pull!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def pull!(peer_host, request) when is_binary(peer_host) and is_map(request) do
    post(peer_host, "/federation/pull", request)
  end

  @spec fetch_ppe!(String.t(), String.t()) :: {:ok, map()} | {:error, term()}
  def fetch_ppe!(peer_host, did) when is_binary(peer_host) and is_binary(did) do
    url = "#{scheme(peer_host)}://#{peer_host}/federation/ppe/#{URI.encode_www_form(did)}"

    options =
      [url: url, receive_timeout: @default_timeout, retry: false] ++ req_options()

    case Req.get(options) do
      {:ok, %Req.Response{status: status, body: %{"ppe" => ppe}}}
      when status in 200..299 and is_map(ppe) ->
        {:ok, ppe}

      {:ok, %Req.Response{status: status, body: resp}} ->
        {:error, {:http_error, status, resp}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp post(peer_host, path, inner) do
    body = Wrapper.encode_body(inner, sender_anchor_id: this_anchor_id())
    url = "#{scheme(peer_host)}://#{peer_host}#{path}"

    options =
      [
        url: url,
        body: body,
        headers: [{"content-type", "application/json"}],
        receive_timeout: @default_timeout
      ] ++ req_options()

    case Req.post(options) do
      {:ok, %Req.Response{status: status, body: resp}} when status in 200..299 ->
        {:ok, resp}

      {:ok, %Req.Response{status: status, body: resp}} ->
        {:error, {:http_error, status, resp}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp scheme(peer_host) do
    if String.starts_with?(peer_host, "localhost") or
         String.starts_with?(peer_host, "127.0.0.1") do
      "http"
    else
      "https"
    end
  end

  defp this_anchor_id do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get_lazy(:anchor_id, &endpoint_host/0)
  end

  defp endpoint_host do
    url = Application.get_env(:yawp, YawpWeb.Endpoint, [])[:url] || []
    host = Keyword.get(url, :host, "localhost")

    case Keyword.get(url, :port) do
      nil -> host
      port -> "#{host}:#{port}"
    end
  end

  defp req_options do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get(:req_options, [])
  end
end
