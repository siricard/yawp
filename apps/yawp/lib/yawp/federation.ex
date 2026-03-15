defmodule Yawp.Federation do
  @moduledoc """
  Ash domain for the federation surface — anchor server keypair, signed
  delivery wrapper, anchor-to-anchor sync, presence broker, DM relay.

   adds the `Yawp.Federation.ServerKey` resource and the
  `/.well-known/yawp/server-key.json` endpoint. Later
  + features land the signed wrappers, inbox push, and presence
  broker.

  See (anchor sync protocol) (federation routing) (server keypair).
  """

  use Ash.Domain, otp_app: :yawp

  resources do
    resource Yawp.Federation.ServerKey do
      define :generate_server_key, action: :generate, args: []
      define :get_active_server_key, action: :get_active, not_found_error?: false
      define :list_published_server_keys, action: :list_published
      define :revoke_server_key, action: :revoke
    end
  end

  @doc """
  Ensures an active server key exists. Called on application boot
  (idempotent). If a key is already active, returns `:ok`. Otherwise
  generates a fresh Ed25519 keypair, persists it, and logs the
  `key_id`.
  """
  @spec ensure_active_server_key!() :: :ok
  def ensure_active_server_key! do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{}} ->
        :ok

      {:ok, nil} ->
        {:ok, key} = generate_server_key()
        require Logger
        Logger.info("Generated federation server key #{key.key_id}")
        :ok
    end
  end

  @doc """
  Signs an RFC-8785 canonicalised payload with the active server
  key. Returns `{:ok, signature, key_id}` on success.

  Callers must pass the already-decoded payload term (map / list /
  primitive); this function canonicalises it via
  `Yawp.CanonicalJson.encode/1` before signing.
  """
  @spec sign(term(), keyword()) :: {:ok, binary(), String.t()} | {:error, :no_active_key}
  def sign(payload, _opts \\ []) do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{} = key} ->
        canonical = Yawp.CanonicalJson.encode(payload)
        signature = :crypto.sign(:eddsa, :none, canonical, [key.private_key, :ed25519])
        {:ok, signature, key.key_id}

      {:ok, nil} ->
        {:error, :no_active_key}
    end
  end
end
