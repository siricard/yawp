defmodule Yawp.RpcError do
  @moduledoc """
  Splode-shaped Ash error that carries an explicit RPC `type` slug. Used by pre-auth signed RPC actions
  so the failure envelope surfaces a stable string the client can key
  off (`claim_token_consumed`, `invalid_signature`, etc.) instead of a
  generic `invalid_changes`.
  """

  use Splode.Error, fields: [:type, :message, :fields], class: :invalid

  def message(%{message: message}) when is_binary(message), do: message

  def message(%{type: type}) when is_binary(type) or is_atom(type) do
    "rpc error: #{type}"
  end

  def message(_), do: "rpc error"
end

defimpl AshTypescript.Rpc.Error, for: Yawp.RpcError do
  def to_error(error) do
    %{
      message: error.message || "rpc error",
      short_message: "Error",
      vars: Map.new(Map.get(error, :vars) || []),
      type: to_string(error.type),
      fields: List.wrap(error.fields),
      path: error.path || []
    }
  end
end
