defmodule Yawp.Admin.AccountTest do
  use Yawp.DataCase, async: false

  alias Yawp.Admin.Account, as: User

  @pubkey_hex "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8"
  @expected_did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"

  defp pubkey, do: Base.decode16!(@pubkey_hex, case: :lower)

  describe "register_with_pubkey/1" do
    test "creates a user, derives did, defaults recovery_methods to []" do
      assert {:ok, user} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey()},
                 authorize?: false
               )
               |> Ash.create()

      assert user.public_key == pubkey()
      assert user.did == @expected_did
      assert user.home_server == nil
      assert user.recovery_methods == []
    end

    test "rejects duplicate public_key" do
      assert {:ok, _} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey()},
                 authorize?: false
               )
               |> Ash.create()

      assert {:error, %Ash.Error.Invalid{}} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey()},
                 authorize?: false
               )
               |> Ash.create()
    end

    test "requires public_key" do
      assert {:error, %Ash.Error.Invalid{}} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{}, authorize?: false)
               |> Ash.create()
    end

    test "different pubkeys produce different DIDs" do
      pk1 = :crypto.strong_rand_bytes(32)
      pk2 = :crypto.strong_rand_bytes(32)

      assert {:ok, u1} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pk1},
                 authorize?: false
               )
               |> Ash.create()

      assert {:ok, u2} =
               User
               |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pk2},
                 authorize?: false
               )
               |> Ash.create()

      assert u1.did != u2.did
      assert u1.did == Yawp.Identity.did_from_pubkey(pk1)
      assert u2.did == Yawp.Identity.did_from_pubkey(pk2)
    end
  end
end
