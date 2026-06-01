defmodule Yawp.Servers.SetupState do
  @moduledoc """
  Read-only view of whether this anchor has been claimed by an operator
  yet, plus the public metadata an unauthenticated client needs to
  decide how to bind.

  An anchor is *claimed* once the first operator has completed the
  chat-owner claim flow — concretely, once an Owner-role membership
  exists on the singleton server. Before that, the only valid token is
  the operator claim token; after that, the only valid token is a chat
  invite.

  `info/0` powers `GET /.well-known/yawp/server-info`.
  """

  require Ash.Query

  alias Yawp.Servers

  @type info :: %{
          claimed: boolean(),
          server_name: String.t() | nil,
          fingerprint: String.t() | nil
        }

  @spec claimed?() :: boolean()
  def claimed? do
    with {:ok, %Servers.Server{} = server} <- get_server(),
         {:ok, %Servers.Role{} = owner_role} <-
           Servers.get_system_role_for_server("Owner", server.id) do
      owner_membership?(server.id, owner_role.id)
    else
      _ -> false
    end
  end

  @spec info() :: info()
  def info do
    {server_name, _server_id} =
      case get_server() do
        {:ok, %Servers.Server{} = server} -> {server.name, server.id}
        _ -> {nil, nil}
      end

    %{
      claimed: claimed?(),
      server_name: server_name,
      fingerprint: fingerprint()
    }
  end

  @spec fingerprint() :: String.t() | nil
  def fingerprint do
    case Yawp.Federation.get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{public_key: pk}} when is_binary(pk) ->
        format_fingerprint(pk)

      _ ->
        nil
    end
  end

  defp format_fingerprint(public_key) do
    <<group::binary-size(8), _rest::binary>> = :crypto.hash(:sha256, public_key)

    group
    |> Base.encode16(case: :lower)
    |> String.codepoints()
    |> Enum.chunk_every(4)
    |> Enum.map_join(":", &Enum.join/1)
  end

  defp get_server do
    case Servers.get_singleton_server() do
      {:ok, %Servers.Server{} = server} -> {:ok, server}
      _ -> :error
    end
  end

  defp owner_membership?(server_id, owner_role_id) do
    Servers.Membership
    |> Ash.Query.filter(server_id == ^server_id and role_id == ^owner_role_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> case do
      [] -> false
      [_ | _] -> true
    end
  end
end
