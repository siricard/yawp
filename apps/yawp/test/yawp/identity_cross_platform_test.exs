defmodule Yawp.IdentityCrossPlatformTest do
  @moduledoc """
  Asserts that the server agrees with the canonical cross-platform identity
  fixture at `priv/test_vectors/identity.json`. The same fixture is consumed
  by the web and React Native test suites, ensuring all three surfaces
  produce byte-identical DIDs and Ed25519 signatures.
  """

  use ExUnit.Case, async: true

  alias Yawp.Identity

  @fixture_path Path.join([
                  :code.priv_dir(:yawp) |> to_string(),
                  "test_vectors",
                  "identity.json"
                ])

  setup_all do
    vector = @fixture_path |> File.read!() |> Jason.decode!()
    {:ok, vector: vector}
  end

  test "fixture seed derives the fixture public key", %{vector: v} do
    sk = Base.decode16!(v["sk_seed_hex"], case: :lower)
    expected_pk = Base.decode16!(v["pk_hex"], case: :lower)

    {pk, ^sk} = :crypto.generate_key(:eddsa, :ed25519, sk)
    assert pk == expected_pk
  end

  test "base64 and hex encodings of the keys agree", %{vector: v} do
    assert Base.decode16!(v["sk_seed_hex"], case: :lower) ==
             Base.decode64!(v["sk_seed_base64"])

    assert Base.decode16!(v["pk_hex"], case: :lower) ==
             Base.decode64!(v["pk_base64"])
  end

  test "fixture public key derives the fixture DID", %{vector: v} do
    pk = Base.decode16!(v["pk_hex"], case: :lower)
    assert Identity.did_from_pubkey(pk) == v["did"]
  end

  test "fixture signature verifies under the fixture public key", %{vector: v} do
    pk = Base.decode16!(v["pk_hex"], case: :lower)
    sig = Base.decode16!(v["signature_hex"], case: :lower)
    msg = v["signature_message_utf8"]

    assert :crypto.verify(:eddsa, :sha512, msg, sig, [pk, :ed25519])
  end

  test "signing the fixture message with the fixture seed reproduces the fixture signature",
       %{vector: v} do
    sk = Base.decode16!(v["sk_seed_hex"], case: :lower)
    expected_sig = Base.decode16!(v["signature_hex"], case: :lower)
    msg = v["signature_message_utf8"]

    assert :crypto.sign(:eddsa, :sha512, msg, [sk, :ed25519]) == expected_sig
  end
end
