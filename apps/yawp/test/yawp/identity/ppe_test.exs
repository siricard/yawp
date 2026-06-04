defmodule Yawp.Identity.PpeTest do
  @moduledoc """
  Strict PPE schema validation. The cached Public Profile Envelope is
  user-signed; before an anchor promotes any field into its own
  columns it must reject envelopes that violate the documented shape
  so a malformed or oversized field can never reach the render path.
  """
  use Yawp.DataCase, async: true

  alias Yawp.Identity.Ppe

  defp valid_pubkey do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    Base.url_encode64(pub, padding: false)
  end

  defp valid_envelope(attrs \\ %{}) do
    Map.merge(
      %{
        "did" => "did:yawp:alice",
        ("public_" <> "key") => valid_pubkey(),
        "profile_version" => 3,
        "anchors" => ["anchor-a.example", "localhost:14100"],
        "display_name" => "Alice",
        "avatar_ref" => "https://cdn.example/a.png",
        "bio" => "hi"
      },
      attrs
    )
  end

  describe "validate/1 happy path" do
    test "accepts a well-formed envelope" do
      assert :ok = Ppe.validate(valid_envelope())
    end

    test "accepts an envelope with optional fields omitted" do
      env = %{
        "did" => "did:yawp:min",
        ("public_" <> "key") => valid_pubkey(),
        "profile_version" => 0,
        "anchors" => ["anchor-a.example"]
      }

      assert :ok = Ppe.validate(env)
    end

    test "accepts valid device_subkeys records" do
      {pk, _} = :crypto.generate_key(:eddsa, :ed25519)
      sig = :crypto.strong_rand_bytes(64)

      record = %{
        "device_id" => "11111111-1111-1111-1111-111111111111",
        "pk" => Base.url_encode64(pk, padding: false),
        "signature" => Base.url_encode64(sig, padding: false),
        "issued_at" => "2026-01-01T00:00:00Z"
      }

      assert :ok = Ppe.validate(valid_envelope(%{"device_subkeys" => [record]}))
    end
  end

  describe "validate/1 rejects malformed input" do
    test "rejects a non-map" do
      assert {:error, :not_a_map} = Ppe.validate("nope")
    end

    test "rejects a missing or blank did" do
      assert {:error, :invalid_did} = Ppe.validate(valid_envelope(%{"did" => ""}))
      assert {:error, :invalid_did} = Ppe.validate(Map.delete(valid_envelope(), "did"))
    end

    test "rejects a non-integer or negative profile_version" do
      assert {:error, :invalid_profile_version} =
               Ppe.validate(valid_envelope(%{"profile_version" => "3"}))

      assert {:error, :invalid_profile_version} =
               Ppe.validate(valid_envelope(%{"profile_version" => -1}))
    end

    test "rejects a public_key that is not 32 bytes" do
      short = Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false)

      assert {:error, :invalid_public_key} =
               Ppe.validate(valid_envelope(%{("public_" <> "key") => short}))

      assert {:error, :invalid_public_key} =
               Ppe.validate(Map.delete(valid_envelope(), "public_key"))
    end

    test "rejects anchors that are not a list of valid hosts" do
      assert {:error, :invalid_anchors} =
               Ppe.validate(valid_envelope(%{"anchors" => "a.example"}))

      assert {:error, :invalid_anchors} =
               Ppe.validate(valid_envelope(%{"anchors" => ["https://a.example/path"]}))

      assert {:error, :invalid_anchors} =
               Ppe.validate(valid_envelope(%{"anchors" => ["bad host with spaces"]}))
    end

    test "rejects an oversized display_name" do
      long = String.duplicate("x", 101)

      assert {:error, :invalid_display_name} =
               Ppe.validate(valid_envelope(%{"display_name" => long}))
    end

    test "rejects an avatar_ref with a bad shape" do
      assert {:error, :invalid_avatar_ref} =
               Ppe.validate(valid_envelope(%{"avatar_ref" => "just-a-bare-string"}))
    end

    test "rejects an oversized bio" do
      long = String.duplicate("x", 1001)
      assert {:error, :invalid_bio} = Ppe.validate(valid_envelope(%{"bio" => long}))
    end

    test "rejects device_subkeys that is not a list" do
      assert {:error, :invalid_device_subkeys} =
               Ppe.validate(valid_envelope(%{"device_subkeys" => %{"subkeys" => []}}))
    end

    test "rejects a device_subkeys record with a malformed key" do
      record = %{
        "device_id" => "d1",
        "pk" => Base.url_encode64(:crypto.strong_rand_bytes(16), padding: false),
        "signature" => Base.url_encode64(:crypto.strong_rand_bytes(64), padding: false),
        "issued_at" => "2026-01-01T00:00:00Z"
      }

      assert {:error, :invalid_device_subkeys} =
               Ppe.validate(valid_envelope(%{"device_subkeys" => [record]}))
    end
  end
end
