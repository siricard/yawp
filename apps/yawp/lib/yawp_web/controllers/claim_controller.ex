defmodule YawpWeb.ClaimController do
  @moduledoc """
  `POST /api/claim` — the server-claim endpoint.

  Pre-auth by design: the request signature *is* the auth. The
  controller verifies the signed claim payload, upserts the singleton
  chat-owner `Yawp.Identity.Identity`, assigns the `Owner` system role
  on the singleton server, consumes the claim token, and writes an
  audit-log entry.

  All failure modes return a JSON 4xx with `{"error": "<slug>"}` using
  the vocabulary:

    * `invalid_payload` — body shape / base64 sizing wrong
    * `claim_token_invalid` — unknown token (404)
    * `claim_token_consumed` — already consumed (409)
    * `claim_token_revoked` — operator revoked it (409)
    * `claim_token_expired` — past `expires_at` (410)
    * `did_mismatch` — DID does not match pk
    * `invalid_signature` — ed25519 verify failed
    * `internal_error` — DB write error (500)
  """

  use YawpWeb, :controller

  require Logger

  alias Yawp.Admin
  alias Yawp.Identity
  alias Yawp.Servers

  def create(conn, params) do
    with {:ok, parsed} <- parse_payload(params),
         {:ok, claim} <- lookup_token(parsed.claim_token),
         :ok <- check_state(claim),
         :ok <- check_did(parsed.did, parsed.public_key),
         :ok <- verify_signature(parsed, claim) do
      finalize(conn, parsed, claim)
    else
      {:error, slug} -> respond_error(conn, slug)
    end
  end

  defp parse_payload(params) do
    with %{
           "claim_token" => token,
           "did" => did,
           "pk" => pk_b64,
           "sender_signature" => sig_b64
         } <- params,
         true <- is_binary(token) and is_binary(did) and is_binary(pk_b64) and is_binary(sig_b64),
         {:ok, pk} <- decode_b64(pk_b64),
         {:ok, sig} <- decode_b64(sig_b64),
         true <- byte_size(pk) == 32,
         true <- byte_size(sig) == 64 do
      {:ok, %{claim_token: token, did: did, pk_b64: pk_b64, public_key: pk, signature: sig}}
    else
      _ -> {:error, :invalid_payload}
    end
  end

  defp decode_b64(b64) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, bytes} -> {:ok, bytes}
      :error -> :error
    end
  end

  defp lookup_token(token) do
    case Admin.get_claim_token_by_token(token) do
      {:ok, %Admin.ClaimToken{} = claim} -> {:ok, claim}
      {:ok, nil} -> {:error, :claim_token_invalid}
      {:error, _} -> {:error, :claim_token_invalid}
    end
  end

  defp check_state(%Admin.ClaimToken{} = claim) do
    cond do
      claim.consumed_at != nil ->
        {:error, :claim_token_consumed}

      claim.revoked_at != nil ->
        {:error, :claim_token_revoked}

      DateTime.compare(claim.expires_at, DateTime.utc_now()) != :gt ->
        {:error, :claim_token_expired}

      true ->
        :ok
    end
  end

  defp check_did(did, pk) do
    expected = "did:yawp:" <> Identity.did_from_pubkey(pk)
    if expected == did, do: :ok, else: {:error, :did_mismatch}
  end

  defp verify_signature(parsed, _claim) do
    canonical =
      Yawp.CanonicalJson.encode(%{
        "claim_token" => parsed.claim_token,
        "did" => parsed.did,
        "pk" => parsed.pk_b64
      })

    case :crypto.verify(:eddsa, :none, canonical, parsed.signature, [
           parsed.public_key,
           :ed25519
         ]) do
      true -> :ok
      false -> {:error, :invalid_signature}
    end
  end

  defp finalize(conn, parsed, claim) do
    try do
      {:ok, identity} =
        Identity.claim_chat_owner(%{
          did: parsed.did,
          master_public_key: parsed.public_key
        })

      {:ok, server} = Servers.get_singleton_server()

      if server == nil do
        Logger.error("ClaimController: singleton server missing — seed did not run")
        respond_error(conn, :internal_error)
      else
        owner_role = Servers.get_system_role_for_server("Owner", server.id)

        if owner_role == nil do
          Logger.error("ClaimController: Owner system role missing for server #{server.id}")
          respond_error(conn, :internal_error)
        else
          {:ok, _membership} =
            Servers.assign_role(identity.id, server.id, owner_role.id)

          {:ok, _consumed} =
            claim
            |> Ash.Changeset.for_update(:consume, %{})
            |> Ash.update(authorize?: false)

          _ =
            Admin.audit!(nil, "claim_token.consume", %{
              token_id: claim.id,
              did: parsed.did,
              identity_id: identity.id
            })

          conn
          |> put_status(:ok)
          |> json(%{"did" => parsed.did, "role" => "Owner"})
        end
      end
    rescue
      error ->
        Logger.error("ClaimController: claim failed — #{inspect(error)}")
        respond_error(conn, :internal_error)
    end
  end

  defp respond_error(conn, slug) do
    status = status_for(slug)

    conn
    |> put_status(status)
    |> json(%{"error" => Atom.to_string(slug)})
  end

  defp status_for(:invalid_payload), do: :bad_request
  defp status_for(:claim_token_invalid), do: :not_found
  defp status_for(:claim_token_consumed), do: :conflict
  defp status_for(:claim_token_revoked), do: :conflict
  defp status_for(:claim_token_expired), do: :gone
  defp status_for(:did_mismatch), do: :bad_request
  defp status_for(:invalid_signature), do: :bad_request
  defp status_for(:internal_error), do: :internal_server_error
end
