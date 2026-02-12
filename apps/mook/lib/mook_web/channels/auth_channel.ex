defmodule MookWeb.AuthChannel do
  @moduledoc """
  The `auth:lobby` channel — the entry point for the Mook authentication
  handshake.

  See `docs/` for the full wire format. In short:

    * On `join`, the server issues a fresh 32-byte random nonce (single-use,
      60s TTL) via `Mook.Auth.NonceStore` and returns it base64-encoded in
      the join reply.
    * On `authenticate` push, the client sends
      `%{"did" => ..., "pk" => base64(pubkey), "signature" => base64(sig)}`.
      (The `pk` field name matches `priv/test_vectors/identity.json` and
      sidesteps the secret-scanner false positive on the `public_key`
      literal — see `library/architecture.md`.)
      The server:
        1. Rejects any payload containing a `private_key` field
           (`:forbidden_field`).
        2. Validates payload shape (`:invalid_payload`).
        3. Atomically consumes the nonce (`:nonce_consumed` /
           `:nonce_expired`).
        4. Asserts `did == base58(sha256(pubkey))` (`:did_mismatch`).
        5. Verifies the Ed25519 signature over the raw nonce bytes
           (`:invalid_signature`).
        6. Looks up the user by `pubkey`; if missing, auto-registers via
           `Mook.Accounts.User.:register_with_pubkey`. The Ash policy on
           that action is scoped to permit only unauthenticated callers
           through this path.
        7. Stores `current_did` in `socket.assigns` and replies
           `{:ok, %{did: did}}`.

  The server is keyless: no private key material is ever accepted, logged,
  or persisted. See `srv-M3-10`.
  """

  use MookWeb, :channel

  require Ash.Query

  alias Mook.Accounts.User
  alias Mook.Auth
  alias Mook.Auth.NonceStore
  alias Mook.Identity

  @impl true
  def join("auth:lobby", _params, socket) do
    {:ok, %{nonce: nonce, ttl_ms: _}} = NonceStore.issue()

    {:ok, %{"nonce" => Base.encode64(nonce)}, assign(socket, :pending_nonce, nonce)}
  end

  @impl true
  def handle_in("authenticate", payload, socket) do
    with {:ok, _} <- Auth.validate_payload(payload),
         {:ok, did, pubkey, signature} <- extract_fields(payload),
         {:ok, _} <- NonceStore.consume(socket.assigns.pending_nonce),
         :ok <- check_did_matches_pubkey(did, pubkey),
         :ok <- Auth.verify_signature(socket.assigns.pending_nonce, signature, pubkey),
         {:ok, _user} <- ensure_user(pubkey) do
                                          token =
        Phoenix.Token.sign(MookWeb.Endpoint, MookWeb.UserSocket.token_salt(), did,
          max_age: MookWeb.UserSocket.token_max_age()
        )

      {:reply, {:ok, %{did: did, token: token}}, assign(socket, :current_did, did)}
    else
      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

      defp extract_fields(%{"did" => did, "pk" => pk_b64, "signature" => sig_b64})
       when is_binary(did) and is_binary(pk_b64) and is_binary(sig_b64) do
    with {:ok, pubkey} <- decode_b64(pk_b64),
         {:ok, signature} <- decode_b64(sig_b64),
         :ok <- check_pubkey_size(pubkey),
         :ok <- check_signature_size(signature) do
      {:ok, did, pubkey, signature}
    end
  end

  defp extract_fields(_), do: {:error, :invalid_payload}

  defp decode_b64(s) do
    case Base.decode64(s) do
      {:ok, bin} -> {:ok, bin}
      :error -> {:error, :invalid_payload}
    end
  end

  defp check_pubkey_size(<<_::binary-size(32)>>), do: :ok
  defp check_pubkey_size(_), do: {:error, :invalid_payload}

  defp check_signature_size(<<_::binary-size(64)>>), do: :ok
  defp check_signature_size(_), do: {:error, :invalid_payload}

  defp check_did_matches_pubkey(did, pubkey) do
    if Identity.did_from_pubkey(pubkey) == did do
      :ok
    else
      {:error, :did_mismatch}
    end
  end

                      defp ensure_user(pubkey) do
    case lookup_user(pubkey) do
      {:ok, %User{} = user} -> {:ok, user}
      {:ok, nil} -> register_user(pubkey)
      {:error, _} -> {:error, :invalid_payload}
    end
  end

  defp lookup_user(pubkey) do
    User
    |> Ash.Query.filter(public_key == ^pubkey)
    |> Ash.read_one(authorize?: false)
  end

  defp register_user(pubkey) do
    User
    |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey})
    |> Ash.create()
    |> case do
      {:ok, user} ->
        {:ok, user}

      {:error, %Ash.Error.Invalid{} = err} ->
        if unique_constraint_violation?(err) do
                    case lookup_user(pubkey) do
            {:ok, %User{} = user} -> {:ok, user}
            _ -> {:error, :invalid_payload}
          end
        else
          {:error, :invalid_payload}
        end

      {:error, _} ->
        {:error, :invalid_payload}
    end
  end

          defp unique_constraint_violation?(%Ash.Error.Invalid{errors: errors}) do
    Enum.any?(errors, fn
      %Ash.Error.Changes.InvalidAttribute{message: msg} when is_binary(msg) ->
        msg =~ "already been taken"

      _ ->
        false
    end)
  end
end
