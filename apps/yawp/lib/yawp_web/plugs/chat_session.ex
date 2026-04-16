defmodule Yawp.Plug.ChatSession do
  @moduledoc """
  reads `Authorization: Bearer <token>` from the request
  headers and resolves it via `Yawp.Identity.verify_session/1`.

  Two modes:

    * Default (pass-through, used as an actor-resolver in front of
      RPC routes): on success, assigns `:current_identity` and sets
      the Ash actor via `Ash.PlugHelpers.set_actor/2`. On failure
      (missing / malformed / expired / revoked token) the plug
      passes through with no assigns set — downstream actions that
      declare `authorize?: false` keep working with `actor: nil`,
      and authorized actions enforce the auth requirement at the
      Ash policy layer.

    * Gate mode (`require: true`): on failure, halts the connection
      with HTTP 401 and a JSON `%{error: "invalid_session"}` body.

  header-only transport, no cookies. The same plug serves
  both web and native clients.
  """

  import Plug.Conn

  alias Yawp.Identity

  @behaviour Plug

  @impl Plug
  def init(opts), do: opts

  @impl Plug
  def call(conn, opts) do
    require? = Keyword.get(opts, :require, false)

    with {:ok, token} <- extract_bearer(conn),
         {:ok, identity} <- Identity.verify_session(token) do
      conn
      |> assign(:current_identity, identity)
      |> Ash.PlugHelpers.set_actor(identity)
    else
      _ ->
        if require? do
          conn
          |> put_resp_content_type("application/json")
          |> send_resp(401, ~s({"error":"invalid_session"}))
          |> halt()
        else
          conn
        end
    end
  end

  defp extract_bearer(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] when byte_size(token) > 0 -> {:ok, token}
      ["bearer " <> token] when byte_size(token) > 0 -> {:ok, token}
      _ -> :error
    end
  end
end
