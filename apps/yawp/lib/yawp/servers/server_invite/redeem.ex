defmodule Yawp.Servers.ServerInvite.Redeem do
  @moduledoc """
  implementation of the `:redeem` generic action on
  `Yawp.Servers.ServerInvite`.

  Pre-auth signed: the prospective member signs the canonical-JSON
  payload `%{"token" => ..., "did" => ..., "pk" => ...}` with their
  master Ed25519 key. The action:

    1. Decodes the `pk` (32 bytes) and `sender_signature` (64 bytes)
       and verifies the signature.
    2. Validates `did == "did:yawp:" <> did_from_pubkey(pk)`.
    3. Loads the invite by token.
    4. Classifies invite state (invalid / consumed / exhausted /
       expired / revoked) and returns the matching slug.
    5. In a single transaction:
       - Upserts the redeemer's `Yawp.Identity.Identity` row.
       - Atomically consumes / decrements the invite (filter+atomic
         update — concurrent redeems race in Postgres).
       - Assigns the Member-role membership for the invite's server.
       - Records the `invite.redeem` audit entry.

    6. Returns `%{server_id: <uuid>, role: "Member"}`.
  """

  use Ash.Resource.Actions.Implementation

  require Ash.Query

  alias Yawp.Admin
  alias Yawp.Identity
  alias Yawp.RpcError
  alias Yawp.Servers
  alias Yawp.Servers.ServerInvite

  @impl true
  def run(input, _opts, _context) do
    with {:ok, pk_bytes, sig_bytes} <- decode(input.arguments),
         :ok <- verify_signature(input.arguments, pk_bytes, sig_bytes),
         :ok <- verify_did(input.arguments.did, pk_bytes),
         :ok <- check_claimed(),
         {:ok, invite} <- load_invite(input.arguments.token),
         :ok <- check_state(invite) do
      do_redeem(invite, input.arguments, pk_bytes)
    end
  end

  defp check_claimed do
    if Yawp.Servers.SetupState.claimed?() do
      :ok
    else
      {:error, rpc("server_not_claimed_use_claim_token")}
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
    case ServerInvite
         |> Ash.Query.for_read(:get_by_token, %{token: token})
         |> Ash.read_one(authorize?: false) do
      {:ok, %ServerInvite{} = invite} -> {:ok, invite}
      {:ok, nil} -> {:error, rpc("invite_token_invalid")}
      {:error, _} -> {:error, rpc("invite_token_invalid")}
    end
  end

  defp check_state(%ServerInvite{revoked_at: ra}) when not is_nil(ra),
    do: {:error, rpc("invite_token_revoked")}

  defp check_state(%ServerInvite{expires_at: ea}) do
    if DateTime.compare(ea, DateTime.utc_now()) != :gt do
      {:error, rpc("invite_token_expired")}
    else
      :ok
    end
  end

  defp check_state(%ServerInvite{kind: :single_use, consumed_at: ca}) when not is_nil(ca),
    do: {:error, rpc("invite_token_consumed")}

  defp check_state(%ServerInvite{kind: :multi_use, uses_remaining: 0}),
    do: {:error, rpc("invite_token_exhausted")}

  defp check_state(_), do: :ok

  defp do_redeem(invite, args, pk_bytes) do
    Yawp.Repo.transaction(fn ->
      with {:ok, identity, n1} <- upsert_identity(args.did, pk_bytes),
           {:ok, _consumed, n2} <- atomic_consume(invite),
           {:ok, server} <- load_server(invite.server_id),
           {:ok, member_role} <- load_member_role(invite.server_id),
           {:ok, _membership, n3} <-
             Servers.assign_role(identity.id, server.id, [member_role.id],
               return_notifications?: true
             ),
           {:ok, n3b} <- clear_kicked(identity.id, server.id),
           {:ok, _audit, n4} <-
             Admin.create_audit_entry(
               %{
                 account_id: nil,
                 action: "invite.redeem",
                 payload: %{
                   invite_id: invite.id,
                   server_id: server.id,
                   identity_id: identity.id,
                   did: identity.did
                 }
               },
               authorize?: false,
               return_notifications?: true
             ) do
        {%{server_id: server.id, role: "Member"}, n1 ++ n2 ++ n3 ++ n3b ++ n4}
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

  defp atomic_consume(%ServerInvite{kind: :single_use} = invite) do
    invite
    |> Ash.Changeset.for_update(:consume_single_use, %{})
    |> Ash.update(authorize?: false, return_notifications?: true)
    |> case do
      {:ok, consumed, notifications} -> {:ok, consumed, notifications}
      {:ok, consumed} -> {:ok, consumed, []}
      {:error, %Ash.Error.Invalid{errors: errors}} -> classify_invalid(errors)
      {:error, _} -> {:error, :stale}
    end
  end

  defp atomic_consume(%ServerInvite{kind: :multi_use} = invite) do
    invite
    |> Ash.Changeset.for_update(:decrement_multi_use, %{})
    |> Ash.update(authorize?: false, return_notifications?: true)
    |> case do
      {:ok, consumed, notifications} -> {:ok, consumed, notifications}
      {:ok, consumed} -> {:ok, consumed, []}
      {:error, %Ash.Error.Invalid{errors: errors}} -> classify_invalid(errors)
      {:error, _} -> {:error, :stale}
    end
  end

  defp classify_invalid(errors) do
    if Enum.any?(errors, &match?(%Ash.Error.Changes.StaleRecord{}, &1)) do
      {:error, :stale}
    else
      {:error, :stale}
    end
  end

  defp reclassify_stale(invite_id) do
    case Ash.get(ServerInvite, invite_id, authorize?: false) do
      {:ok, %ServerInvite{revoked_at: ra}} when not is_nil(ra) ->
        rpc("invite_token_revoked")

      {:ok, %ServerInvite{kind: :single_use, consumed_at: ca}} when not is_nil(ca) ->
        rpc("invite_token_consumed")

      {:ok, %ServerInvite{kind: :multi_use, uses_remaining: 0}} ->
        rpc("invite_token_exhausted")

      {:ok, %ServerInvite{expires_at: ea}} ->
        if DateTime.compare(ea, DateTime.utc_now()) != :gt do
          rpc("invite_token_expired")
        else
          rpc("invite_token_invalid")
        end

      _ ->
        rpc("invite_token_invalid")
    end
  end

  defp load_server(server_id) do
    case Ash.get(Servers.Server, server_id, authorize?: false) do
      {:ok, server} -> {:ok, server}
      _ -> {:error, rpc("internal_error")}
    end
  end

  defp load_member_role(server_id) do
    case Servers.get_system_role_for_server("Member", server_id) do
      {:ok, %Servers.Role{} = role} -> {:ok, role}
      _ -> {:error, rpc("internal_error")}
    end
  end

  defp clear_kicked(identity_id, server_id) do
    membership =
      Servers.Membership
      |> Ash.Query.filter(identity_id == ^identity_id and server_id == ^server_id)
      |> Ash.Query.limit(1)
      |> Ash.read!(authorize?: false)
      |> List.first()

    case membership do
      %Servers.Membership{kicked: true} = m ->
        m
        |> Ash.Changeset.for_update(:set_moderation, %{kicked: false})
        |> Ash.update(authorize?: false, return_notifications?: true)
        |> case do
          {:ok, _cleared, n} -> {:ok, n}
          {:ok, _cleared} -> {:ok, []}
          {:error, _} = err -> err
        end

      _ ->
        {:ok, []}
    end
  end

  defp rpc(slug) when is_binary(slug) do
    RpcError.exception(type: slug, message: slug)
  end
end
