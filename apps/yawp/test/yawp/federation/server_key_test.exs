defmodule Yawp.Federation.ServerKeyTest do
  @moduledoc """
  Yawp.Federation.ServerKey resource and signing helper.

  Covers : each anchor has an Ed25519 server keypair, stored
  with `key_id`, `public_key`, encrypted `private_key`, validity
  window, and revocation. Boot-time generation must produce a fresh
  keypair when no active key exists for the configured database.

  The "two-anchors-different-keys" assertion is exercised here by
  generating against the dev DB, then truncating the table to
  simulate a fresh Anchor B logical database, and confirming the
  re-bootstrapped key is different.

  Post-: all operations reach the resource through the
  domain `code_interface` (`Yawp.Federation.generate_server_key/1`,
  `get_active_server_key/0`, `revoke_server_key/1`) instead of the
  retired plain-Elixir helpers.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Federation

  describe "ServerKey resource" do
    test "generate persists key_id, public_key, validity window and encrypts private_key" do
      {:ok, key} = Federation.generate_server_key()

      assert is_binary(key.key_id)
      assert byte_size(key.public_key) == 32
      assert %DateTime{} = key.not_before
      assert %DateTime{} = key.not_after
      assert DateTime.compare(key.not_after, key.not_before) == :gt
      assert key.revoked_at == nil

                  raw =
        Yawp.Repo.query!(
          "select encrypted_private_key from federation_server_keys where id = $1",
          [Ecto.UUID.dump!(key.id)]
        )

      [[ciphertext]] = raw.rows
      assert is_binary(ciphertext)
      refute String.contains?(ciphertext, key.public_key)
    end

    test "get_active_server_key/0 returns the currently-valid, non-revoked key" do
      {:ok, key} = Federation.generate_server_key()
      {:ok, active} = Federation.get_active_server_key()

      assert active.id == key.id
            assert byte_size(active.private_key) == 32
    end

    test "get_active_server_key/0 returns {:ok, nil} when nothing is generated" do
      assert {:ok, nil} = Federation.get_active_server_key()
    end

    test "get_active_server_key/0 ignores revoked and out-of-window keys" do
      {:ok, expired} =
        Federation.generate_server_key(%{
          not_before: DateTime.add(DateTime.utc_now(), -10 * 86_400, :second),
          not_after: DateTime.add(DateTime.utc_now(), -86_400, :second)
        })

      {:ok, _other} = Federation.generate_server_key()
      {:ok, revoked} = Federation.revoke_server_key(expired)
      assert revoked.revoked_at != nil

            {:ok, valid} = Federation.generate_server_key()

      {:ok, active} = Federation.get_active_server_key()
      assert active.id == valid.id
    end
  end

  describe "ensure_active_server_key!/0" do
    test "is a no-op when an active key exists" do
      {:ok, key} = Federation.generate_server_key()
      :ok = Federation.ensure_active_server_key!()

      keys = Yawp.Repo.all(Yawp.Federation.ServerKey)
      assert length(keys) == 1
      assert hd(keys).id == key.id
    end

    test "generates a fresh key when none exists; second logical DB yields a different key" do
      :ok = Federation.ensure_active_server_key!()
      {:ok, key_a} = Federation.get_active_server_key()

                  Yawp.Repo.query!("truncate table federation_server_keys")
      :ok = Federation.ensure_active_server_key!()
      {:ok, key_b} = Federation.get_active_server_key()

      refute key_a.key_id == key_b.key_id
      refute key_a.public_key == key_b.public_key
      refute key_a.private_key == key_b.private_key
    end
  end

  describe "Federation.sign/2" do
    test "signs an RFC-8785-canonicalised payload with the active key and verifies" do
      {:ok, _} = Federation.generate_server_key()

      payload = %{"b" => 2, "a" => [1, 2, 3]}
      {:ok, sig, key_id} = Federation.sign(payload)

      assert is_binary(sig)
      assert byte_size(sig) == 64
      assert is_binary(key_id)

            {:ok, active} = Federation.get_active_server_key()
      assert active.key_id == key_id

      canonical = Yawp.CanonicalJson.encode(payload)
      assert :crypto.verify(:eddsa, :none, canonical, sig, [active.public_key, :ed25519])
    end

    test "returns {:error, :no_active_key} when no key is present" do
      assert {:error, :no_active_key} = Federation.sign(%{"hello" => "world"})
    end
  end
end
