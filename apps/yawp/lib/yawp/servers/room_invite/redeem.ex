defmodule Yawp.Servers.RoomInvite.Redeem do
  @moduledoc """
  Implementation of the `:redeem` generic action on
  `Yawp.Servers.RoomInvite`.

  Pre-auth signed: the prospective member signs the canonical-JSON
  payload `%{"token" => ..., "did" => ..., "pk" => ...}` with their
  master Ed25519 key. The action verifies the signature and DID
  derivation, then, in a single transaction: upserts the redeemer's
  identity, atomically consumes / decrements the invite, ensures a
  membership (auto-creating a `:guest` membership for a stranger), grants
  channel read access via an identity-level channel override, and records
  an audit entry.

  Returns `%{server_id, channel_id, kind}` on success.
  """

  use Ash.Resource.Actions.Implementation

  require Ash.Query

  alias Yawp.Admin
  alias Yawp.Identity
  alias Yawp.RpcError
  alias Yawp.Servers
  alias Yawp.Servers.Permissions
  alias Yawp.Servers.RoomInvite

  @impl true
  def run(input, _opts, _context) do
    with {:ok, pk_bytes, sig_bytes} <- decode(input.arguments),
         :ok <- verify_signature(input.arguments, pk_bytes, sig_bytes),
         :ok <- verify_did(input.arguments.did, pk_bytes),
         {:ok, invite} <- load_invite(input.arguments.token),
         :ok <- check_state(invite) do
      do_redeem(invite, input.arguments, pk_bytes)
    end
  end

  defp decode(args) do
    with {:ok, pk} <- decode_b64(args.pk, 32),
         {:ok, sig} <- decode_b64(args.sender_signature, 64) do
      {:ok, pk, sig}
    else
      _ -> {:error, rpc("invalid_payload")}
    end
  end

  defp decode_b64(b64, expected_size) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, raw} when byte_size(raw) == expected_size -> {:ok, raw}
      _ -> :error
    end
  end

  defp decode_b64(_, _), do: :error

  defp verify_signature(args, pk, sig) do
    canonical =
      Yawp.CanonicalJson.encode(%{
        "token" => args.token,
        "did" => args.did,
        "pk" => args.pk
      })

    if :crypto.verify(:eddsa, :none, canonical, sig, [pk, :ed25519]) do
      :ok
    else
      {:error, rpc("invalid_signature")}
    end
  end

  defp verify_did(did, pk) do
    if did == "did:yawp:" <> Identity.did_from_pubkey(pk) do
      :ok
    else
      {:error, rpc("did_mismatch")}
    end
  end

  defp load_invite(token) do
    case RoomInvite
         |> Ash.Query.for_read(:get_by_token, %{token: token})
         |> Ash.read_one(authorize?: false) do
      {:ok, %RoomInvite{} = invite} -> {:ok, invite}
      {:ok, nil} -> {:error, rpc("invite_token_invalid")}
      {:error, _} -> {:error, rpc("invite_token_invalid")}
    end
  end

  defp check_state(%RoomInvite{revoked_at: ra}) when not is_nil(ra),
    do: {:error, rpc("invite_token_revoked")}

  defp check_state(%RoomInvite{expires_at: ea}) do
    if DateTime.compare(ea, DateTime.utc_now()) != :gt do
      {:error, rpc("invite_token_expired")}
    else
      :ok
    end
  end

  defp check_state(%RoomInvite{kind: :single_use, consumed_at: ca}) when not is_nil(ca),
    do: {:error, rpc("invite_token_consumed")}

  defp check_state(%RoomInvite{kind: :multi_use, uses_remaining: 0}),
    do: {:error, rpc("invite_token_exhausted")}

  defp check_state(_), do: :ok

  defp do_redeem(invite, args, pk_bytes) do
    Yawp.Repo.transaction(fn ->
      with {:ok, identity, n1} <- upsert_identity(args.did, pk_bytes),
           {:ok, _consumed, n2} <- atomic_consume(invite),
           {:ok, kind, n3} <- ensure_membership(identity.id, invite.server_id),
           {:ok, _override, n4} <- ensure_channel_access(identity.id, invite.channel_id),
           {:ok, _audit, n5} <- write_audit(invite, identity) do
        result = %{
          server_id: invite.server_id,
          channel_id: invite.channel_id,
          kind: to_string(kind)
        }

        {result, n1 ++ n2 ++ n3 ++ n4 ++ n5}
      else
        {:error, %RpcError{} = err} -> Yawp.Repo.rollback(err)
        {:error, :stale} -> Yawp.Repo.rollback(reclassify_stale(invite.id))
        {:error, _other} -> Yawp.Repo.rollback(rpc("internal_error"))
      end
    end)
    |> case do
      {:ok, {result, notifications}} ->
        Ash.Notifier.notify(notifications)
        {:ok, result}

      {:error, %RpcError{} = err} ->
        {:error, err}

      {:error, _other} ->
        {:error, rpc("internal_error")}
    end
  end

  defp upsert_identity(did, pk_bytes) do
    Yawp.Identity.Identity
    |> Ash.Changeset.for_create(
      :upsert_via_invite,
      %{did: did, master_public_key: pk_bytes},
      upsert?: true,
      upsert_identity: :unique_did
    )
    |> Ash.create(authorize?: false, return_notifications?: true)
    |> case do
      {:ok, identity, notifications} -> {:ok, identity, notifications}
      {:ok, identity} -> {:ok, identity, []}
      other -> other
    end
  end

  defp atomic_consume(%RoomInvite{kind: :single_use} = invite) do
    invite
    |> Ash.Changeset.for_update(:consume_single_use, %{})
    |> Ash.update(authorize?: false, return_notifications?: true)
    |> normalize_consume()
  end

  defp atomic_consume(%RoomInvite{kind: :multi_use} = invite) do
    invite
    |> Ash.Changeset.for_update(:decrement_multi_use, %{})
    |> Ash.update(authorize?: false, return_notifications?: true)
    |> normalize_consume()
  end

  defp normalize_consume({:ok, consumed, notifications}), do: {:ok, consumed, notifications}
  defp normalize_consume({:ok, consumed}), do: {:ok, consumed, []}
  defp normalize_consume({:error, %Ash.Error.Invalid{}}), do: {:error, :stale}
  defp normalize_consume({:error, _}), do: {:error, :stale}

  defp ensure_membership(identity_id, server_id) do
    case fetch_membership(identity_id, server_id) do
      %Servers.Membership{kind: kind} ->
        {:ok, kind, []}

      nil ->
        Servers.Membership
        |> Ash.Changeset.for_create(:create, %{
          identity_id: identity_id,
          server_id: server_id,
          role_ids: [],
          kind: :guest
        })
        |> Ash.create(authorize?: false, return_notifications?: true)
        |> case do
          {:ok, _membership, n} -> {:ok, :guest, n}
          {:ok, _membership} -> {:ok, :guest, []}
          {:error, _} = err -> err
        end
    end
  end

  defp ensure_channel_access(identity_id, channel_id) do
    read_bit = Permissions.bit(:read_messages)

    existing =
      Servers.ChannelOverride
      |> Ash.Query.filter(channel_id == ^channel_id and identity_id == ^identity_id)
      |> Ash.read!(authorize?: false)
      |> List.first()

    case existing do
      %Servers.ChannelOverride{} = override ->
        {:ok, override, []}

      nil ->
        Servers.ChannelOverride
        |> Ash.Changeset.for_create(:create, %{
          channel_id: channel_id,
          identity_id: identity_id,
          allow_bits: read_bit,
          deny_bits: 0
        })
        |> Ash.create(authorize?: false, return_notifications?: true)
        |> case do
          {:ok, override, n} -> {:ok, override, n}
          {:ok, override} -> {:ok, override, []}
          {:error, _} = err -> err
        end
    end
  end

  defp write_audit(invite, identity) do
    Admin.create_audit_entry(
      %{
        account_id: nil,
        action: "room_invite.redeem",
        payload: %{
          invite_id: invite.id,
          server_id: invite.server_id,
          channel_id: invite.channel_id,
          identity_id: identity.id,
          did: identity.did
        }
      },
      authorize?: false,
      return_notifications?: true
    )
    |> case do
      {:ok, audit, n} -> {:ok, audit, n}
      {:ok, audit} -> {:ok, audit, []}
      other -> other
    end
  end

  defp reclassify_stale(invite_id) do
    case Ash.get(RoomInvite, invite_id, authorize?: false) do
      {:ok, %RoomInvite{revoked_at: ra}} when not is_nil(ra) ->
        rpc("invite_token_revoked")

      {:ok, %RoomInvite{kind: :single_use, consumed_at: ca}} when not is_nil(ca) ->
        rpc("invite_token_consumed")

      {:ok, %RoomInvite{kind: :multi_use, uses_remaining: 0}} ->
        rpc("invite_token_exhausted")

      {:ok, %RoomInvite{expires_at: ea}} ->
        if DateTime.compare(ea, DateTime.utc_now()) != :gt do
          rpc("invite_token_expired")
        else
          rpc("invite_token_invalid")
        end

      _ ->
        rpc("invite_token_invalid")
    end
  end

  defp fetch_membership(identity_id, server_id) do
    Servers.Membership
    |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
    |> Ash.Query.limit(1)
    |> Ash.read!(authorize?: false)
    |> List.first()
  end

  defp rpc(slug) when is_binary(slug) do
    RpcError.exception(type: slug, message: slug)
  end
end
