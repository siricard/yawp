defmodule Yawp.TestSupport.Bip39Test do
          use ExUnit.Case, async: true

  alias Yawp.TestSupport.Bip39
  alias Yawp.TestSupport.Hkdf

  @fixture_path Path.expand(
                  "../../../priv/test_vectors/bip39.json",
                  __DIR__
                )

  @fixture @fixture_path |> File.read!() |> Jason.decode!()
  @official_vectors @fixture["official_vectors"]
  @yawp_vectors @fixture["yawp_vectors"]
  @japanese_vectors @fixture["japanese_vectors"]

  describe "official BIP-39 English vectors" do
    for {v, idx} <- Enum.with_index(@official_vectors) do
      @v v
      @idx idx
      test "##{@idx} entropy → mnemonic → seed" do
        entropy = Base.decode16!(@v["entropy_hex"], case: :lower)
        words = String.split(@v["mnemonic"], " ")

        assert Bip39.entropy_to_mnemonic(entropy) == words
        assert Bip39.validate_mnemonic(words) == :ok

        seed = Bip39.mnemonic_to_seed(words, @v["passphrase"])
        assert Base.encode16(seed, case: :lower) == @v["seed_hex"]
      end
    end
  end

  describe "Yawp-specific HKDF derivation vectors" do
    for {v, idx} <- Enum.with_index(@yawp_vectors) do
      @v v
      @idx idx
      test "##{@idx} entropy → master_seed + bundle_key" do
        entropy = Base.decode16!(@v["entropy_hex"], case: :lower)
        words = Bip39.entropy_to_mnemonic(entropy)
        assert words == String.split(@v["mnemonic"], " ")

        seed = Bip39.mnemonic_to_seed(words, @v["passphrase"])
        assert Base.encode16(seed, case: :lower) == @v["seed_hex"]

        master = Hkdf.derive(seed, "yawp-master-v1", "ed25519-seed", 32)
        assert Base.encode16(master, case: :lower) == @v["master_derived_hex"]

        bundle = Hkdf.derive(seed, "yawp-bundle-v1", "chacha20-poly1305", 32)
        assert Base.encode16(bundle, case: :lower) == @v["bundle_derived_hex"]
      end
    end
  end

            describe "BIP-39 Japanese vectors (NFKD code-path)" do
    for {v, idx} <- Enum.with_index(@japanese_vectors) do
      @v v
      @idx idx
      test "##{@idx} #{@v["description"]}" do
        words = String.split(@v["mnemonic"], "\u3000")
        seed = Bip39.mnemonic_to_seed(words, @v["passphrase"])
        assert Base.encode16(seed, case: :lower) == @v["seed_hex"]
      end
    end
  end

  describe "validate_mnemonic/1" do
    test "rejects a bad checksum" do
            words =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon"
        |> String.split(" ")

      assert {:error, :bad_checksum} = Bip39.validate_mnemonic(words)
    end

    test "rejects an invalid word count" do
      assert {:error, :invalid_word_count} = Bip39.validate_mnemonic(~w(abandon abandon))
    end

    test "rejects a word not in the dictionary" do
      words =
        "notaword abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        |> String.split(" ")

      assert {:error, :unknown_word} = Bip39.validate_mnemonic(words)
    end

    test "accepts the all-zero entropy mnemonic" do
      words =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
        |> String.split(" ")

      assert :ok = Bip39.validate_mnemonic(words)
    end

    test "accepts the all-ones entropy mnemonic" do
      words =
        "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong"
        |> String.split(" ")

      assert :ok = Bip39.validate_mnemonic(words)
    end
  end

  describe "entropy_to_mnemonic/1" do
    test "rejects non-128-bit entropy" do
      assert_raise ArgumentError, fn -> Bip39.entropy_to_mnemonic(<<0::64>>) end
    end
  end

  describe "Hkdf.derive/4" do
    test "RFC 5869 test case 1 (SHA-256)" do
      ikm = Base.decode16!("0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B0B")
      salt = Base.decode16!("000102030405060708090A0B0C")
      info = Base.decode16!("F0F1F2F3F4F5F6F7F8F9")

      okm = Hkdf.derive(ikm, salt, info, 42)

      assert Base.encode16(okm, case: :lower) ==
               "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    end
  end
end
