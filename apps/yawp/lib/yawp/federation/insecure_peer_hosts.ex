defmodule Yawp.Federation.InsecurePeerHosts do
  @moduledoc false

  @loopback_hosts ["localhost", "127.0.0.1", "::1"]

  def insecure?(host) when is_binary(host) do
    parsed_host = parsed_host(host)

    parsed_host in @loopback_hosts or exact_opt_in?(host, parsed_host)
  end

  defp exact_opt_in?(host, parsed_host) do
    configured_hosts()
    |> Enum.any?(fn configured ->
      configured == host or configured == parsed_host
    end)
  end

  defp configured_hosts do
    Application.get_env(:yawp, :federation_insecure_peer_hosts, [])
    |> Enum.filter(&is_binary/1)
  end

  defp parsed_host(host) do
    case URI.parse("//#{host}") do
      %URI{host: parsed} when is_binary(parsed) -> parsed
      _ -> host
    end
  end
end
