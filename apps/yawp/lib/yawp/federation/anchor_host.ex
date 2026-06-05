defmodule Yawp.Federation.AnchorHost do
  @moduledoc false

  @spec normalize(String.t()) :: String.t()
  def normalize(anchor) when is_binary(anchor) do
    anchor
    |> String.trim()
    |> parse()
    |> case do
      {host, nil} when is_binary(host) -> String.downcase(host)
      {host, port} when is_binary(host) and is_integer(port) -> "#{String.downcase(host)}:#{port}"
      _ -> anchor
    end
  end

  defp parse(anchor) do
    case URI.parse(anchor) do
      %URI{scheme: scheme, host: host, port: port} when is_binary(scheme) and is_binary(host) ->
        {host, non_default_port(scheme, port)}

      _ ->
        case URI.parse("//#{anchor}") do
          %URI{host: host, port: port} when is_binary(host) -> {host, port}
          _ -> nil
        end
    end
  end

  defp non_default_port("http", 80), do: nil
  defp non_default_port("https", 443), do: nil
  defp non_default_port(_scheme, port), do: port
end
