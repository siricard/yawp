defmodule Yawp.Identity do
  @moduledoc """
  Client identity primitives shared across the Yawp server and clients,
  and the Ash domain hosting identity-bearing resources.

  ## DID derivation

  A user's decentralized identifier (DID) is derived deterministically from
  their Ed25519 public key:

      did = base58(SHA-256(public_key_bytes))

  The same derivation is implemented on web (`@noble/ed25519` + `@noble/hashes`
  + `bs58`) and React Native. The canonical test vector lives at
  `priv/test_vectors/identity.json` and is consumed by tests on every platform.

  ## Domain

  This module also serves as the Ash domain hosting the
  identity-bearing resources (PPE bundle, private blob, device subkeys,
  etc.). only adds the bare `Yawp.Identity.Identity` resource
  stub; richer behavior lands+. See ADRs 005–007.
  """

  use Ash.Domain, otp_app: :yawp, extensions: [AshTypescript.Rpc]

  require Ash.Query

  typescript_rpc do
    resource Yawp.Identity.Identity do
      rpc_action :claim_chat_owner, :claim_chat_owner

      rpc_action :bind_device, :bind_device,
        identities: [:unique_did],
        show_metadata: [:session_token, :refresh_token, :expires_at]

      rpc_action :revoke_device_sessions, :revoke_device_sessions, identities: [:unique_did]

      rpc_action :add_anchor, :add_anchor, identities: [:unique_did]
    end

    resource Yawp.Identity.RefreshToken do
      rpc_action :rotate_refresh, :rotate,
        show_metadata: [:session_token, :refresh_token, :expires_at]
    end
  end

  resources do
    resource Yawp.Identity.Identity do
      define :claim_chat_owner, action: :claim_chat_owner
      define :get_chat_owner, action: :get_chat_owner, not_found_error?: false
      define :get_identity_by_did, action: :get_by_did, args: [:did]
      define :bind_device, action: :bind_device
      define :add_anchor, action: :add_anchor
    end

    resource Yawp.Identity.SessionToken do
      define :revoke_session, action: :revoke
    end

    resource Yawp.Identity.RefreshToken

    resource Yawp.Identity.Ppe do
      define :get_ppe_by_did, action: :get_by_did, args: [:did], not_found_error?: false
    end

    resource Yawp.Identity.PrivateBlob do
      define :get_private_blob_by_did, action: :get_by_did, args: [:did], not_found_error?: false
    end
  end

  @spec adopt_identity(map()) :: {:ok, :adopted} | {:error, term()}
  def adopt_identity(%{"did" => did, "master_public_key" => pk_b64, "ppe" => ppe} = envelope)
      when is_binary(did) and is_binary(pk_b64) and is_map(ppe) do
    source_anchor = Map.get(envelope, "source_anchor")

    with {:ok, pk} <- decode_master_key(pk_b64),
         :ok <- verify_did_derivation(did, pk),
         :ok <- verify_ppe_belongs_to(ppe, did),
         {:ok, status} when status in [:applied, :stale] <- apply_ppe_if_newer(ppe),
         {:ok, _identity} <- upsert_adopted_identity(did, pk, source_anchor) do
      {:ok, :adopted}
    else
      _ -> {:error, :invalid_adoption}
    end
  end

  def adopt_identity(_), do: {:error, :invalid_adoption}

  defp verify_ppe_belongs_to(ppe, did) do
    if ppe["did"] == did do
      Yawp.Federation.InnerSignature.verify(ppe, "did", "signature")
    else
      {:error, :invalid_adoption}
    end
  end

  defp decode_master_key(pk_b64) do
    raw = String.replace_prefix(pk_b64, "ed25519:", "")

    decoded =
      case Base.url_decode64(raw, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(raw, padding: false)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == 32 -> {:ok, bytes}
      _ -> {:error, :invalid_adoption}
    end
  end

  defp verify_did_derivation(did, pk) do
    expected = "did:yawp:" <> did_from_pubkey(pk)
    if did == expected, do: :ok, else: {:error, :invalid_adoption}
  end

  defp upsert_adopted_identity(did, pk, source_anchor) do
    anchor_list = if is_binary(source_anchor), do: [source_anchor], else: []

    Yawp.Identity.Identity
    |> Ash.Changeset.for_create(:adopt, %{
      did: did,
      master_public_key: pk,
      anchor_list: anchor_list
    })
    |> Ash.create(authorize?: false)
  end

  @spec apply_ppe_if_newer(map()) :: {:ok, :applied | :stale} | {:error, term()}
  def apply_ppe_if_newer(envelope) when is_map(envelope) do
    case Yawp.Identity.Ppe.validate(envelope) do
      :ok ->
        did = Map.fetch!(envelope, "did")
        incoming_version = Map.fetch!(envelope, "profile_version")

        case get_ppe_by_did(did) do
          {:ok, %Yawp.Identity.Ppe{profile_version: current}} when current >= incoming_version ->
            {:ok, :stale}

          {:ok, _} ->
            do_upsert_ppe(did, incoming_version, envelope)
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp do_upsert_ppe(did, version, envelope) do
    Yawp.Identity.Ppe
    |> Ash.Changeset.for_create(:upsert, %{
      did: did,
      display_name: Map.get(envelope, "display_name"),
      avatar_ref: Map.get(envelope, "avatar_ref"),
      bio: Map.get(envelope, "bio"),
      profile_version: version,
      envelope: envelope
    })
    |> Ash.create(authorize?: false)
    |> case do
      {:ok, _} -> {:ok, :applied}
      {:error, _} = err -> err
    end
  end

  @spec apply_blob_if_newer(String.t(), binary(), integer(), keyword()) ::
          {:ok, :applied | :stale} | {:error, term()}
  def apply_blob_if_newer(did, ciphertext, blob_version, opts \\ [])
      when is_binary(did) and is_binary(ciphertext) and is_integer(blob_version) do
    case get_private_blob_by_did(did) do
      {:ok, %Yawp.Identity.PrivateBlob{blob_version: current}} when current >= blob_version ->
        {:ok, :stale}

      {:ok, _} ->
        Yawp.Identity.PrivateBlob
        |> Ash.Changeset.for_create(:upsert, %{
          did: did,
          ciphertext: ciphertext,
          blob_version: blob_version,
          public_key: Keyword.get(opts, :public_key),
          signature: Keyword.get(opts, :signature)
        })
        |> Ash.create(authorize?: false)
        |> case do
          {:ok, _} -> {:ok, :applied}
          {:error, _} = err -> err
        end
    end
  end

  @spec apply_device_subkey_change(String.t(), map(), integer() | nil) ::
          {:ok, Yawp.Identity.Identity.t()} | {:error, term()}
  def apply_device_subkey_change(did, device_subkeys, profile_version \\ nil)
      when is_binary(did) and is_map(device_subkeys) do
    case get_identity_by_did(did) do
      {:ok, %Yawp.Identity.Identity{} = identity} ->
        attrs = %{device_subkeys: device_subkeys}

        attrs =
          if is_integer(profile_version),
            do: Map.put(attrs, :profile_version, profile_version),
            else: attrs

        identity
        |> Ash.Changeset.for_update(:apply_device_change, attrs)
        |> Ash.update(authorize?: false)

      _ ->
        {:error, :not_found}
    end
  end

  @doc """
  issues a session+refresh pair for the given identity +
  device. Returns `{:ok, %{session_token: %SessionToken{}, refresh_token: %RefreshToken{}}}`.
  """
  @spec issue_pair(binary(), binary()) ::
          {:ok,
           %{
             session_token: Yawp.Identity.SessionToken.t(),
             refresh_token: Yawp.Identity.RefreshToken.t()
           }}
          | {:error, term()}
  def issue_pair(identity_id, device_id)
      when is_binary(identity_id) and is_binary(device_id) do
    Yawp.Identity.RefreshToken
    |> Ash.Changeset.for_create(:issue_pair, %{
      identity_id: identity_id,
      device_id: device_id
    })
    |> Ash.create(authorize?: false)
    |> case do
      {:ok, refresh} ->
        session = refresh.__metadata__[:paired_session_token]
        {:ok, %{session_token: session, refresh_token: refresh}}

      {:error, _} = err ->
        err
    end
  end

  @doc """
  verifies a session token and returns `{:ok, identity}` on
  success, or `{:error, :invalid_session}` for any failure (unknown,
  expired, revoked). Single error slug to avoid leaking token state
  to unauthenticated callers.
  """
  @spec verify_session(String.t() | nil) ::
          {:ok, Yawp.Identity.Identity.t()} | {:error, :invalid_session}
  def verify_session(token) when is_binary(token) do
    case Yawp.Identity.SessionToken
         |> Ash.Query.for_read(:get_valid_by_token, %{token: token})
         |> Ash.read_one(authorize?: false) do
      {:ok, %Yawp.Identity.SessionToken{identity_id: identity_id}} ->
        case Ash.get(Yawp.Identity.Identity, identity_id, authorize?: false) do
          {:ok, identity} -> {:ok, identity}
          _ -> {:error, :invalid_session}
        end

      _ ->
        {:error, :invalid_session}
    end
  end

  def verify_session(_), do: {:error, :invalid_session}

  @doc """
  atomically rotates a refresh token: marks the old one's
  `rotated_to` and issues a fresh `{session_token, refresh_token}`
  pair, all inside one `Repo.transaction/1`.

  Returns:
    * `{:ok, %{session_token: ..., refresh_token: ...}}` on success
    * `{:error, :invalid}` when no such token exists
    * `{:error, :rotated}` when the refresh has already been rotated
    * `{:error, :revoked}` when the refresh has been revoked
    * `{:error, :expired}` when the refresh has expired
  """
  @spec rotate_refresh(String.t()) ::
          {:ok,
           %{
             session_token: Yawp.Identity.SessionToken.t(),
             refresh_token: Yawp.Identity.RefreshToken.t()
           }}
          | {:error, :invalid | :rotated | :revoked | :expired}
  def rotate_refresh(token) when is_binary(token) do
    Yawp.Repo.transaction(fn ->
      case Yawp.Identity.RefreshToken
           |> Ash.Query.for_read(:get_by_token, %{token: token})
           |> Ash.read_one(authorize?: false) do
        {:ok, nil} ->
          Yawp.Repo.rollback(:invalid)

        {:error, _} ->
          Yawp.Repo.rollback(:invalid)

        {:ok, %Yawp.Identity.RefreshToken{} = refresh} ->
          do_rotate(refresh)
      end
    end)
    |> case do
      {:ok, {result, notifications}} ->
        Ash.Notifier.notify(notifications)
        {:ok, result}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def rotate_refresh(_), do: {:error, :invalid}

  defp do_rotate(%Yawp.Identity.RefreshToken{} = refresh) do
    case Yawp.Identity.RefreshToken
         |> Ash.Changeset.for_create(:issue_pair, %{
           identity_id: refresh.identity_id,
           device_id: refresh.device_id
         })
         |> Ash.create(authorize?: false, return_notifications?: true) do
      {:ok, new_refresh, n1} ->
        case refresh
             |> Ash.Changeset.for_update(:mark_rotated, %{rotated_to: new_refresh.id})
             |> Ash.update(authorize?: false, return_notifications?: true) do
          {:ok, _, n2} ->
            session = new_refresh.__metadata__[:paired_session_token]
            {%{session_token: session, refresh_token: new_refresh}, n1 ++ n2}

          {:error, %Ash.Error.Invalid{errors: errors}} ->
            if Enum.any?(errors, &match?(%Ash.Error.Changes.StaleRecord{}, &1)) do
              Yawp.Repo.rollback(classify_stale(refresh.id))
            else
              Yawp.Repo.rollback(:invalid)
            end

          {:error, _} ->
            Yawp.Repo.rollback(:invalid)
        end

      {:error, _} ->
        Yawp.Repo.rollback(:invalid)
    end
  end

  defp classify_stale(refresh_id) do
    case Ash.get(Yawp.Identity.RefreshToken, refresh_id, authorize?: false) do
      {:ok, %Yawp.Identity.RefreshToken{rotated_to: rt}} when not is_nil(rt) ->
        :rotated

      {:ok, %Yawp.Identity.RefreshToken{revoked_at: ra}} when not is_nil(ra) ->
        :revoked

      {:ok, %Yawp.Identity.RefreshToken{expires_at: ea}} ->
        if DateTime.compare(ea, DateTime.utc_now()) != :gt do
          :expired
        else
          :invalid
        end

      _ ->
        :invalid
    end
  end

  @doc """
  revokes every session + refresh token for the given
  identity + device. Used by "sign out of this device" /
  kick-from-server flows.
  """
  @spec revoke_all_for_device(binary(), binary()) :: :ok
  def revoke_all_for_device(identity_id, device_id)
      when is_binary(identity_id) and is_binary(device_id) do
    now = DateTime.utc_now()

    import Ecto.Query

    Yawp.Repo.update_all(
      from(s in "identity_session_tokens",
        where:
          s.identity_id == type(^identity_id, Ecto.UUID) and
            s.device_id == type(^device_id, Ecto.UUID) and
            is_nil(s.revoked_at)
      ),
      set: [revoked_at: now]
    )

    Yawp.Repo.update_all(
      from(r in "identity_refresh_tokens",
        where:
          r.identity_id == type(^identity_id, Ecto.UUID) and
            r.device_id == type(^device_id, Ecto.UUID) and
            is_nil(r.revoked_at)
      ),
      set: [revoked_at: now]
    )

    :ok
  end

  @doc """
  revokes every session + refresh token for the given identity across
  all devices. Used by the kick-from-server flow to immediately
  invalidate the kicked identity's authenticated sessions.
  """
  @spec revoke_all_for_identity(binary()) :: :ok
  def revoke_all_for_identity(identity_id) when is_binary(identity_id) do
    now = DateTime.utc_now()

    import Ecto.Query

    Yawp.Repo.update_all(
      from(s in "identity_session_tokens",
        where: s.identity_id == type(^identity_id, Ecto.UUID) and is_nil(s.revoked_at)
      ),
      set: [revoked_at: now]
    )

    Yawp.Repo.update_all(
      from(r in "identity_refresh_tokens",
        where: r.identity_id == type(^identity_id, Ecto.UUID) and is_nil(r.revoked_at)
      ),
      set: [revoked_at: now]
    )

    :ok
  end

  @base58_alphabet ~c"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

  @doc """
  Returns the DID for the given 32-byte Ed25519 public key.

  The DID is the base58 encoding (Bitcoin alphabet) of the SHA-256 hash of the
  raw public key bytes.
  """
  @spec did_from_pubkey(binary()) :: String.t()
  def did_from_pubkey(pubkey) when is_binary(pubkey) do
    pubkey
    |> hash()
    |> base58_encode()
  end

  defp hash(bytes), do: :crypto.hash(:sha256, bytes)

  @doc false
  @spec base58_encode(binary()) :: String.t()
  def base58_encode(<<>>), do: ""

  def base58_encode(bytes) when is_binary(bytes) do
    leading_zeros = count_leading_zeros(bytes, 0)
    int = :binary.decode_unsigned(bytes, :big)

    encoded =
      int
      |> encode_int([])
      |> List.to_string()

    String.duplicate(<<Enum.at(@base58_alphabet, 0)>>, leading_zeros) <> encoded
  end

  defp encode_int(0, []), do: [Enum.at(@base58_alphabet, 0)]
  defp encode_int(0, acc), do: acc

  defp encode_int(n, acc) do
    encode_int(div(n, 58), [Enum.at(@base58_alphabet, rem(n, 58)) | acc])
  end

  defp count_leading_zeros(<<0, rest::binary>>, n), do: count_leading_zeros(rest, n + 1)
  defp count_leading_zeros(_, n), do: n
end
