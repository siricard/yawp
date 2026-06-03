defmodule Yawp.Identity.PrivateBlobTest do
  @moduledoc """
  The anchor stores the user's private settings blob as ciphertext
  only. On top of the client-side encryption, the column is sealed at
  rest via the cloak vault — a raw database read must never reveal the
  plaintext bytes the client handed us.
  """
  use Yawp.DataCase, async: true

  alias Yawp.Identity

  test "the ciphertext column is encrypted at rest, not stored verbatim" do
    did = "did:yawp:blob-at-rest"
    plaintext = "settings-plaintext-#{System.unique_integer([:positive])}" |> String.duplicate(2)

    {:ok, :applied} = Identity.apply_blob_if_newer(did, plaintext, 1)

    {:ok, blob} = Identity.get_private_blob_by_did(did)
    assert blob.ciphertext == plaintext

    %{rows: [[did_at_rest, raw_at_rest]]} =
      Yawp.Repo.query!(
        "SELECT did, encrypted_ciphertext FROM identity_private_blobs WHERE did = $1",
        [did]
      )

    assert did_at_rest == did
    assert is_binary(raw_at_rest)
    refute raw_at_rest == plaintext
    refute String.contains?(raw_at_rest, plaintext)
  end
end
