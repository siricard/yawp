defmodule Yawp.Federation.MessagePipelineTest do
  @moduledoc """
  Inbound federation messages piggyback a `sender_profile_version`.
  When that version is higher than the locally cached PPE (or we hold
  no cache at all), the pipeline enqueues a background job to refetch
  the sender's canonical PPE from one of their anchors; when the
  version is not newer, it is a no-op.
  """
  use Yawp.DataCase, async: false
  use Oban.Testing, repo: Yawp.Repo

  alias Yawp.Federation.MessagePipeline
  alias Yawp.Federation.PpeRefreshWorker
  alias Yawp.Identity

  defp valid_pubkey do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    Base.url_encode64(pub, padding: false)
  end

  defp seed_cached_ppe!(did, version, anchors) do
    envelope = %{
      "did" => did,
      ("public_" <> "key") => valid_pubkey(),
      "profile_version" => version,
      "anchors" => anchors,
      "display_name" => "Cached"
    }

    {:ok, :applied} = Identity.apply_ppe_if_newer(envelope)
    :ok
  end

  describe "maybe_refresh_ppe/2" do
    test "enqueues a refresh when the inbound version is newer than the cache" do
      did = "did:yawp:stale"
      :ok = seed_cached_ppe!(did, 2, ["anchor-a.example"])

      message = %{
        "sender_did" => did,
        "sender_profile_version" => 5
      }

      assert {:ok, :enqueued} = MessagePipeline.maybe_refresh_ppe(message, [])

      assert_enqueued(
        worker: PpeRefreshWorker,
        args: %{"did" => did, "anchors" => ["anchor-a.example"]}
      )
    end

    test "enqueues a refresh on first contact (no cached PPE) using message anchors" do
      did = "did:yawp:firstcontact"

      message = %{
        "sender_did" => did,
        "sender_profile_version" => 1,
        "sender_anchors" => ["anchor-b.example"]
      }

      assert {:ok, :enqueued} = MessagePipeline.maybe_refresh_ppe(message, [])

      assert_enqueued(
        worker: PpeRefreshWorker,
        args: %{"did" => did, "anchors" => ["anchor-b.example"]}
      )
    end

    test "is a no-op when the inbound version is not newer than the cache" do
      did = "did:yawp:fresh"
      :ok = seed_cached_ppe!(did, 9, ["anchor-a.example"])

      message = %{"sender_did" => did, "sender_profile_version" => 9}

      assert {:ok, :fresh} = MessagePipeline.maybe_refresh_ppe(message, [])
      refute_enqueued(worker: PpeRefreshWorker)
    end

    test "does not enqueue when stale but no anchors are known" do
      did = "did:yawp:noanchors"

      message = %{"sender_did" => did, "sender_profile_version" => 3}

      assert {:ok, :no_anchors} = MessagePipeline.maybe_refresh_ppe(message, [])
      refute_enqueued(worker: PpeRefreshWorker)
    end

    test "ignores a message missing sender_profile_version" do
      message = %{"sender_did" => "did:yawp:x"}
      assert {:ok, :skipped} = MessagePipeline.maybe_refresh_ppe(message, [])
      refute_enqueued(worker: PpeRefreshWorker)
    end
  end
end
