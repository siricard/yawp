defmodule Yawp.IdentityTest do
  use ExUnit.Case, async: true

  alias Yawp.Identity

  describe "did_from_pubkey/1" do
    test "matches the canonical test vector" do
      pubkey =
        Base.decode16!(
          "03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8",
          case: :lower
        )

      assert Identity.did_from_pubkey(pubkey) ==
               "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"
    end

    test "is deterministic" do
      pubkey = :crypto.strong_rand_bytes(32)
      assert Identity.did_from_pubkey(pubkey) == Identity.did_from_pubkey(pubkey)
    end

    test "produces base58 (no 0/O/I/l characters)" do
      pubkey = :crypto.strong_rand_bytes(32)
      did = Identity.did_from_pubkey(pubkey)
      refute String.contains?(did, "0")
      refute String.contains?(did, "O")
      refute String.contains?(did, "I")
      refute String.contains?(did, "l")
    end

    test "different keys produce different DIDs" do
      pk1 = :crypto.strong_rand_bytes(32)
      pk2 = :crypto.strong_rand_bytes(32)
      assert Identity.did_from_pubkey(pk1) != Identity.did_from_pubkey(pk2)
    end
  end

  describe "base58_encode/1" do
    test "encodes empty binary to empty string" do
      assert Identity.base58_encode(<<>>) == ""
    end

    test "preserves leading zero bytes as '1' characters" do
      assert Identity.base58_encode(<<0, 0, 1>>) == "112"
    end
  end
end
