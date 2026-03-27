defmodule Yawp.Identity.ClaimChatOwnerTest do
  @moduledoc """
  `Yawp.Identity.claim_chat_owner/1` upsert action.

  Upserts the singleton chat-owner Identity row keyed by `did`. The
  resource currently holds exactly one row at most (one chat owner per
  anchor); future ownership-transfer flows will need a richer
  contract.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Identity

  defp gen_pk do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    pk
  end

  describe "claim_chat_owner/1" do
    test "creates an Identity row with the supplied did + master public key" do
      pk = gen_pk()
      did = "did:yawp:" <> Identity.did_from_pubkey(pk)

      {:ok, identity} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})

      assert identity.did == did
      assert identity.master_public_key == pk
    end

    test "is idempotent when re-run with the same did + pk" do
      pk = gen_pk()
      did = "did:yawp:" <> Identity.did_from_pubkey(pk)

      {:ok, first} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})
      {:ok, second} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})

      assert first.id == second.id
    end
  end

  describe "get_chat_owner/0" do
    test "returns {:ok, nil} when no chat owner has been claimed" do
      assert {:ok, nil} = Identity.get_chat_owner()
    end

    test "returns the singleton chat-owner row once claimed" do
      pk = gen_pk()
      did = "did:yawp:" <> Identity.did_from_pubkey(pk)
      {:ok, identity} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})

      assert {:ok, fetched} = Identity.get_chat_owner()
      assert fetched.id == identity.id
    end
  end

  describe "get_identity_by_did/1" do
    test "looks up by DID" do
      pk = gen_pk()
      did = "did:yawp:" <> Identity.did_from_pubkey(pk)
      {:ok, identity} = Identity.claim_chat_owner(%{did: did, master_public_key: pk})

      assert {:ok, found} = Identity.get_identity_by_did(did)
      assert found.id == identity.id
    end
  end
end
