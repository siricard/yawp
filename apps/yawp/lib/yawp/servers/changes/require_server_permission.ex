defmodule Yawp.Servers.Changes.RequireServerPermission do
  @moduledoc """
  Gates an action on a named server-level permission bit (ADR 017).

  Pass the required bit as the `:bit` option:

      change Yawp.Servers.Changes.RequireServerPermission, bit: :kick_members

  A `nil` actor is rejected with `not_authenticated`. A present actor
  MUST be a `Yawp.Identity.Identity` whose server-level effective bits
  (resolved via `Yawp.Servers.Permissions.effective_bits/3`) include the
  required bit, otherwise the change rejects with `missing_permission`
  (message set to the bit name).

  The target server is read from the changeset's `server_id` argument or
  attribute.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError
  alias Yawp.Servers.Permissions

  @impl true
  def init(opts) do
    case Keyword.fetch(opts, :bit) do
      {:ok, bit} when is_atom(bit) -> {:ok, opts}
      _ -> {:error, "RequireServerPermission requires a :bit option (atom)"}
    end
  end

  @impl true
  def change(changeset, opts, context) do
    bit = Keyword.fetch!(opts, :bit)

    case context_actor(context) do
      %Yawp.Identity.Identity{} = actor ->
        gate(changeset, actor, bit)

      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "not_authenticated", message: "not_authenticated")
        )
    end
  end

  defp gate(changeset, actor, bit) do
    with {:ok, server} <- resolve_server(changeset),
         true <- Permissions.has?(Permissions.effective_bits(actor, server, nil), bit) do
      changeset
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "missing_permission", message: to_string(bit))
        )
    end
  end

  defp resolve_server(changeset) do
    server_id =
      Ash.Changeset.get_argument(changeset, :server_id) ||
        Ash.Changeset.get_attribute(changeset, :server_id)

    case server_id && Ash.get(Yawp.Servers.Server, server_id, authorize?: false) do
      {:ok, server} -> {:ok, server}
      _ -> :error
    end
  end

  defp context_actor(%{actor: actor}), do: actor
  defp context_actor(_), do: nil
end
