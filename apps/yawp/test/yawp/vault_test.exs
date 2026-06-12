defmodule Yawp.VaultTest do
  use ExUnit.Case, async: false

  alias Yawp.Vault

  setup do
    original = System.get_env("CLOAK_KEY")

    on_exit(fn ->
      case original do
        nil -> System.delete_env("CLOAK_KEY")
        val -> System.put_env("CLOAK_KEY", val)
      end
    end)

    :ok
  end

  describe "init/1 in test env" do
    test "falls back to dev fixture key when CLOAK_KEY is unset" do
      System.delete_env("CLOAK_KEY")

      assert {:ok, config} = Vault.init(otp_app: :yawp)
      assert {Cloak.Ciphers.AES.GCM, opts} = Keyword.fetch!(config, :ciphers)[:default]
      assert opts[:tag] == "AES.GCM.V1"
      assert opts[:iv_length] == 12
      assert byte_size(opts[:key]) == 32
    end

    test "falls back to dev fixture key when CLOAK_KEY is empty" do
      System.put_env("CLOAK_KEY", "")

      assert {:ok, config} = Vault.init(otp_app: :yawp)
      assert {Cloak.Ciphers.AES.GCM, opts} = Keyword.fetch!(config, :ciphers)[:default]
      assert byte_size(opts[:key]) == 32
    end

    test "honors CLOAK_KEY when set to a valid base64 string" do
      raw = :crypto.strong_rand_bytes(32)
      encoded = Base.encode64(raw)
      System.put_env("CLOAK_KEY", encoded)

      assert {:ok, config} = Vault.init(otp_app: :yawp)
      assert {Cloak.Ciphers.AES.GCM, opts} = Keyword.fetch!(config, :ciphers)[:default]
      assert opts[:key] == raw
    end
  end

  describe "Mix.Tasks.Yawp.Gen.CloakKey" do
    test "prints a 44-character base64-encoded 32-byte key" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.Tasks.Yawp.Gen.CloakKey.run([])
        end)

      key = String.trim(output)
      assert String.length(key) == 44
      assert {:ok, raw} = Base.decode64(key)
      assert byte_size(raw) == 32
    end

    test "prints a fresh key on each invocation" do
      out1 = ExUnit.CaptureIO.capture_io(fn -> Mix.Tasks.Yawp.Gen.CloakKey.run([]) end)
      out2 = ExUnit.CaptureIO.capture_io(fn -> Mix.Tasks.Yawp.Gen.CloakKey.run([]) end)
      assert out1 != out2
    end
  end

  test "production branch fails closed when CLOAK_KEY is missing" do
    source = File.read!("lib/yawp/vault.ex")

    assert source =~ "CLOAK_KEY environment variable is missing or empty"
    assert source =~ "raise \"\"\""
    assert source =~ "if Mix.env() in [:dev, :test] do"
  end
end
