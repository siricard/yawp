defmodule Yawp.Admin.AccountTest do
  @moduledoc """
  Yawp.Admin.Account uses Argon2id (via argon2_elixir) for
  password hashing and exposes a domain code_interface
  `Yawp.Admin.create_account/2`. Magic-link, confirmation, and reset
  strategies are NOT part of M7.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Admin
  alias Yawp.Admin.Account

  describe "create_account/2 code interface" do
    test "creates an account with email + hashed_password (Argon2id)" do
      {:ok, account} =
        Admin.create_account(%{
          email: "op@example.com",
          password: "correct horse battery staple",
          password_confirmation: "correct horse battery staple"
        })

      assert to_string(account.email) == "op@example.com"
      assert is_binary(account.hashed_password)
            assert String.starts_with?(account.hashed_password, "$argon2id$")
      assert %DateTime{} = account.inserted_at
      assert account.last_login_at == nil
    end

    test "rejects mismatched password confirmation" do
      assert {:error, _} =
               Admin.create_account(%{
                 email: "op@example.com",
                 password: "correct horse battery staple",
                 password_confirmation: "different"
               })
    end

    test "rejects duplicate email" do
      {:ok, _} =
        Admin.create_account(%{
          email: "op@example.com",
          password: "correct horse battery staple",
          password_confirmation: "correct horse battery staple"
        })

      assert {:error, _} =
               Admin.create_account(%{
                 email: "op@example.com",
                 password: "another password value",
                 password_confirmation: "another password value"
               })
    end
  end

  describe "password hash provider" do
    test "the password strategy uses AshAuthentication.Argon2Provider" do
      strategy = AshAuthentication.Info.strategy!(Account, :password)
      assert strategy.hash_provider == AshAuthentication.Argon2Provider
    end
  end

  describe "sign_in_with_password" do
    setup do
      {:ok, account} =
        Admin.create_account(%{
          email: "op@example.com",
          password: "correct horse battery staple",
          password_confirmation: "correct horse battery staple"
        })

      %{account: account}
    end

    test "accepts the correct password and returns a token", %{account: account} do
      strategy = AshAuthentication.Info.strategy!(Account, :password)

      {:ok, signed_in} =
        AshAuthentication.Strategy.action(strategy, :sign_in, %{
          email: "op@example.com",
          password: "correct horse battery staple"
        })

      assert signed_in.id == account.id
      assert is_binary(signed_in.__metadata__.token)
    end

    test "rejects an incorrect password" do
      strategy = AshAuthentication.Info.strategy!(Account, :password)

      assert {:error, _} =
               AshAuthentication.Strategy.action(strategy, :sign_in, %{
                 email: "op@example.com",
                 password: "wrong wrong wrong"
               })
    end
  end

  describe "dropped strategies" do
    test "no magic_link strategy is configured" do
      strategies = AshAuthentication.Info.authentication_strategies(Account)

      refute Enum.any?(strategies, fn s ->
               match?(%AshAuthentication.Strategy.MagicLink{}, s)
             end)
    end

    test "no confirmation add_on is configured" do
      add_ons = AshAuthentication.Info.authentication_add_ons(Account)

      refute Enum.any?(add_ons, fn a ->
               match?(%AshAuthentication.AddOn.Confirmation{}, a)
             end)
    end

    test "the password strategy has no resettable configured" do
      strategy = AshAuthentication.Info.strategy!(Account, :password)
      assert strategy.resettable == nil or strategy.resettable == []
    end
  end

  describe "attributes" do
    test "exposes inserted_at and last_login_at and has no confirmed_at" do
      attrs = Ash.Resource.Info.attributes(Account) |> Enum.map(& &1.name)
      assert :inserted_at in attrs
      assert :last_login_at in attrs
      refute :confirmed_at in attrs
    end
  end
end
