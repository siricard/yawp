defmodule Yawp.Federation.Client do
  @moduledoc false

  alias Yawp.Federation.AnchorHost
  alias Yawp.Federation.InsecurePeerHosts
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

  @spec push_delivery_ack!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_delivery_ack!(peer_host, ack) when is_binary(peer_host) and is_map(ack) do
    post(peer_host, "/federation/inbox/ack", ack)
  end

  @spec push_read_marker!(String.t(), map()) :: {:ok, map()} | {:error, term()}
  def push_read_marker!(peer_host, marker) when is_binary(peer_host) and is_map(marker) do
    post(peer_host, "/federation/inbox/read-marker", marker)
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
    peer_host = AnchorHost.normalize(peer_host)
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
    if InsecurePeerHosts.insecure?(peer_host) do
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

    case Keyword.get(url, :port) || endpoint_http_port() do
      nil -> host
      port -> "#{host}:#{port}"
    end
  end

  defp endpoint_http_port do
    case Application.get_env(:yawp, YawpWeb.Endpoint, [])[:http] do
      nil -> nil
      http -> Keyword.get(http, :port)
    end
  end

  defp req_options do
    Application.get_env(:yawp, __MODULE__, [])
    |> Keyword.get(:req_options, [])
  end
end
