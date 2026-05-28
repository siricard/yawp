defmodule Yawp.Admin.ClaimTokenTest do
  @moduledoc """
  `Yawp.Admin.ClaimToken` resource + domain code interface.

  Tokens are 128-bit base32 (26 chars, no padding), single-use, with
  a default 15-minute TTL. Generating a new token while one is
  already active automatically revokes the existing active token.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Admin
  alias Yawp.Admin.ClaimToken

  @password "correct horse battery staple"

  defp create_account!(email \\ "op@example.com") do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  describe "attributes" do
    test "exposes the columns" do
      attrs = Ash.Resource.Info.attributes(ClaimToken) |> Enum.map(& &1.name)
      assert :id in attrs
      assert :token in attrs
      assert :expires_at in attrs
      assert :consumed_at in attrs
      assert :revoked_at in attrs
      assert :created_by_account_id in attrs
      assert :inserted_at in attrs
    end
  end

  describe "generate_claim_token/1" do
    test "creates a token in 128-bit base32 form with a 15-minute TTL" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      assert is_binary(claim.token)
      assert String.length(claim.token) == 26
      assert claim.token =~ ~r/^[A-Z2-7]+$/
      assert claim.created_by_account_id == account.id
      assert claim.consumed_at == nil
      assert claim.revoked_at == nil

      ttl_seconds = DateTime.diff(claim.expires_at, DateTime.utc_now())
      assert ttl_seconds in (14 * 60)..(15 * 60)
    end

    test "revokes any currently-active token before creating a new one" do
      account = create_account!()
      {:ok, first} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      {:ok, second} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      {:ok, reloaded_first} = Admin.get_claim_token_by_id(first.id)
      assert reloaded_first.revoked_at != nil
      assert second.id != first.id
      assert second.revoked_at == nil
      assert second.consumed_at == nil
    end
  end

  describe "get_active_claim_token/0" do
    test "returns nil when none exists" do
      assert {:ok, nil} = Admin.get_active_claim_token()
    end

    test "returns the unconsumed, unrevoked, unexpired token" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      assert {:ok, active} = Admin.get_active_claim_token()
      assert active.id == claim.id
    end

    test "skips revoked tokens" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      {:ok, _} = Admin.revoke_claim_token(claim)
      assert {:ok, nil} = Admin.get_active_claim_token()
    end
  end

  describe "revoke_claim_token/1" do
    test "stamps revoked_at on an active token" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      {:ok, revoked} = Admin.revoke_claim_token(claim)
      assert revoked.revoked_at != nil
    end
  end

  describe "consume_claim_token/1" do
    test "stamps consumed_at on first call and rejects subsequent attempts" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      {:ok, consumed} = Admin.consume_claim_token(claim.token)
      assert consumed.consumed_at != nil

      assert {:error, :claim_token_consumed} = Admin.consume_claim_token(claim.token)
    end

    test "rejects unknown tokens with :claim_token_invalid" do
      assert {:error, :claim_token_invalid} = Admin.consume_claim_token("NOSUCH")
    end

    test "rejects a revoked token with :claim_token_invalid" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      {:ok, _} = Admin.revoke_claim_token(claim)
      assert {:error, :claim_token_invalid} = Admin.consume_claim_token(claim.token)
    end

    test "rejects an expired token with :claim_token_expired" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      past = DateTime.add(DateTime.utc_now(), -3600, :second)

      {:ok, _} =
        claim
        |> Ash.Changeset.for_update(:force_expire, %{expires_at: past})
        |> Ash.update(authorize?: false)

      assert {:error, :claim_token_expired} = Admin.consume_claim_token(claim.token)
    end
  end
end
