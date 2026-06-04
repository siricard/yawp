defmodule Yawp.Federation.AnchorAdoptionWorkerTest do
  @moduledoc false
  use Yawp.DataCase, async: false

  alias Yawp.Federation.AnchorAdoptionWorker
  alias Yawp.Identity

  @new_anchor "new-anchor.example"

  setup do
    prev = Application.get_env(:yawp, Yawp.Federation.Client)
    on_exit(fn -> restore(Yawp.Federation.Client, prev) end)

    {:ok, _} = Yawp.Federation.generate_server_key()
    :ok
  end

  defp restore(key, nil), do: Application.delete_env(:yawp, key)
  defp restore(key, prev), do: Application.put_env(:yawp, key, prev)

  defp valid_pubkey do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    Base.url_encode64(pub, padding: false)
  end

  defp seed_user!(did) do
    envelope = %{
      "did" => did,
      ("public_" <> "key") => valid_pubkey(),
      "profile_version" => 4,
      "anchors" => ["anchor-a.example"],
      "display_name" => "Replicated Alice"
    }

    {:ok, :applied} = Identity.apply_ppe_if_newer(envelope)
    {:ok, :applied} = Identity.apply_blob_if_newer(did, :crypto.strong_rand_bytes(48), 2)
    :ok
  end

  test "posts the adoption envelope and the private blob to the new anchor" do
    did = "did:yawp:adopt-worker"
    :ok = seed_user!(did)

    parent = self()

    Application.put_env(:yawp, Yawp.Federation.Client,
      anchor_id: YawpWeb.Endpoint.url(),
      req_options: [
        plug: fn conn ->
          send(parent, {:posted, conn.request_path})
          Req.Test.json(conn, %{"status" => "ok"})
        end
      ]
    )

    assert :ok =
             perform_job(AnchorAdoptionWorker, %{"did" => did, "new_anchor" => @new_anchor})

    assert_received {:posted, "/federation/anchors/adopt"}
    assert_received {:posted, "/federation/blob/push"}
  end

  test "returns an error when the new anchor is unreachable" do
    did = "did:yawp:adopt-unreachable"
    :ok = seed_user!(did)

    Application.put_env(:yawp, Yawp.Federation.Client,
      anchor_id: YawpWeb.Endpoint.url(),
      req_options: [
        plug: fn conn -> Plug.Conn.send_resp(conn, 500, "boom") end
      ]
    )

    assert {:error, _} =
             perform_job(AnchorAdoptionWorker, %{"did" => did, "new_anchor" => @new_anchor})
  end

  defp perform_job(worker, args) do
    worker.perform(%Oban.Job{args: args})
  end
end
