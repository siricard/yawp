defmodule Yawp.Admin.ClaimTokenConcurrencyTest do
  @moduledoc """
  concurrency + FK guarantees for `Yawp.Admin.ClaimToken`.

  Verifies the three blocking issues raised in scrutiny round 1:

    1. `Admin.consume_claim_token/1` must be atomic — concurrent
       callers with the same token must yield exactly one
       `{:ok, _}` and the rest `{:error, :claim_token_consumed}`.
    2. `Admin.generate_claim_token/1` must preserve the
       "exactly one active token" invariant — concurrent generators
       must settle to one active row.
    3. `created_by_account_id` must be a real FK with cascade-delete
       so orphaned operator accounts cannot leave dangling tokens.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Admin
  alias Yawp.Admin.ClaimToken
  import Ecto.Query

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

  describe "concurrent consume_claim_token/1" do
    test "only one of N concurrent callers wins; the rest see :claim_token_consumed" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})

      parent = self()

      tasks =
        for _ <- 1..8 do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())
            Admin.consume_claim_token(claim.token)
          end)
        end

      results = Task.await_many(tasks, 10_000)

      ok_count = Enum.count(results, &match?({:ok, _}, &1))
      consumed_count = Enum.count(results, &match?({:error, :claim_token_consumed}, &1))

      assert ok_count == 1,
             "expected exactly one winner, got #{ok_count} winners — results: #{inspect(results)}"

      assert ok_count + consumed_count == length(results),
             "unexpected error tuples in results: #{inspect(results)}"
    end
  end

  describe "concurrent generate_claim_token/1" do
    test "after N concurrent generators settle, exactly one active token exists" do
      account = create_account!()
      parent = self()

      tasks =
        for _ <- 1..8 do
          Task.async(fn ->
            Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())
            Admin.generate_claim_token(%{created_by_account_id: account.id})
          end)
        end

      results = Task.await_many(tasks, 10_000)
      assert Enum.all?(results, &match?({:ok, %ClaimToken{}}, &1))

      {:ok, active} = Admin.get_active_claim_token()
      refute is_nil(active)

      unrevoked_count =
        Yawp.Repo.one(
          from(t in "admin_claim_tokens",
            where: is_nil(t.consumed_at) and is_nil(t.revoked_at),
            select: count(t.id)
          )
        )

      assert unrevoked_count == 1,
             "expected exactly one unrevoked claim token, got #{unrevoked_count}"
    end
  end

  describe "FK on created_by_account_id" do
    test "deleting an operator account cascades to its claim tokens" do
      account = create_account!()
      {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
      assert {:ok, %ClaimToken{}} = Admin.get_claim_token_by_id(claim.id)

      {1, _} =
        Yawp.Repo.delete_all(from u in "users", where: u.id == type(^account.id, Ecto.UUID))

            remaining =
        Yawp.Repo.one(
          from t in "admin_claim_tokens",
            where: t.id == type(^claim.id, Ecto.UUID),
            select: count(t.id)
        )

      assert remaining == 0,
             "expected the claim token row to cascade-delete with its operator account"
    end

    test "inserting a claim token with a non-existent created_by_account_id fails" do
      bogus_id = Ecto.UUID.generate()

      assert_raise Postgrex.Error, ~r/foreign key/i, fn ->
        Yawp.Repo.insert_all("admin_claim_tokens", [
          %{
            id: Ecto.UUID.bingenerate(),
            token: "FAKETOKEN12345678901234567",
            expires_at: DateTime.utc_now(),
            created_by_account_id: Ecto.UUID.dump!(bogus_id),
            inserted_at: DateTime.utc_now()
          }
        ])
      end
    end
  end
end
