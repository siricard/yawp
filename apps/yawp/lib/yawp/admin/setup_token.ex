defmodule Yawp.Admin.SetupToken do
  @moduledoc """
  In-memory store for the first-boot operator-setup token.

  Holds at most one active token at a time. Idempotent: calling
  `generate/0` twice returns the same token. The token is destroyed
  on first successful operator-account creation; after that there is
  never another setup token on this server.

  Backed by an Agent supervised by `Yawp.Application`. No DB
  persistence, no disk persistence — restart wipes the token. The
  controller (`YawpWeb.AdminSetupController`) also gates every
  request on `Yawp.Admin.Account` existence, so a token left over
  after creation but before invalidation is still inert.
  """

  use Agent

  @name __MODULE__

  def start_link(_opts) do
    Agent.start_link(fn -> nil end, name: @name)
  end

  @doc """
  Returns the current token (or nil). If no token is set, generates a
  fresh 128-bit base32 value, stores it, and returns it. Subsequent
  calls return the same token until `invalidate/0` is called.
  """
  @spec generate() :: {:ok, binary()}
  def generate do
    token =
      Agent.get_and_update(@name, fn
        nil ->
          new = generate_token()
          {new, new}

        existing ->
          {existing, existing}
      end)

    {:ok, token}
  end

  @doc "Returns the current token, or nil if none is set."
  @spec current() :: binary() | nil
  def current, do: Agent.get(@name, & &1)

  @doc "True iff `token` is a non-nil binary matching the current token."
  @spec valid?(binary() | nil) :: boolean()
  def valid?(token) when is_binary(token) and byte_size(token) > 0 do
    current() == token
  end

  def valid?(_), do: false

  @doc "Clears the stored token."
  @spec invalidate() :: :ok
  def invalidate, do: Agent.update(@name, fn _ -> nil end)

  @doc """
  Atomic check-and-clear. Returns `{:ok, token}` exactly once for the
  caller that matches the current stored token, and `{:error, :invalid}`
  for every other caller (wrong token, no token set, or a later caller
  after the winner has already consumed). Safe under concurrent callers
  — the underlying Agent serializes `get_and_update`, so only one task
  can win.

  Used by `YawpWeb.AdminSetupController` to make first-boot operator
  creation atomic: the token must be consumed and the account created
  in a single logical step so that two simultaneous valid POSTs cannot
  both succeed.
  """
  @spec consume(binary() | nil) :: {:ok, binary()} | {:error, :invalid}
  def consume(token) when is_binary(token) and byte_size(token) > 0 do
    Agent.get_and_update(@name, fn
      ^token -> {{:ok, token}, nil}
      other -> {{:error, :invalid}, other}
    end)
  end

  def consume(_), do: {:error, :invalid}

  @doc "Test-only: clear any current token without ceremony."
  @spec reset() :: :ok
  def reset, do: invalidate()

    defp generate_token do
    :crypto.strong_rand_bytes(16)
    |> Base.encode32(padding: false)
  end
end
