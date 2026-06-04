defmodule Yawp.Federation.PpeRefreshWorkerTest do
  @moduledoc """
  The background worker fetches a sender's canonical PPE from one of
  their anchors and applies it to the local cache if newer. It tries
  each anchor in turn until one returns a usable envelope.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Federation.PpeRefreshWorker
  alias Yawp.Identity

  defp valid_pubkey do
    {pub, _priv} = :crypto.generate_key(:eddsa, :ed25519)
    Base.url_encode64(pub, padding: false)
  end

  setup do
    prev = Application.get_env(:yawp, Yawp.Federation.Client)
    on_exit(fn -> restore(Yawp.Federation.Client, prev) end)
    :ok
  end

  defp restore(key, nil), do: Application.delete_env(:yawp, key)
  defp restore(key, prev), do: Application.put_env(:yawp, key, prev)

  test "fetches the PPE from the first reachable anchor and applies it" do
    did = "did:yawp:worker-apply"

    envelope = %{
      "did" => did,
      ("public_" <> "key") => valid_pubkey(),
      "profile_version" => 7,
      "anchors" => ["anchor-a.example"],
      "display_name" => "Worker Alice"
    }

    Application.put_env(:yawp, Yawp.Federation.Client,
      req_options: [
        plug: fn conn ->
          Req.Test.json(conn, %{"ppe" => envelope})
        end
      ]
    )

    assert :ok =
             perform_job(PpeRefreshWorker, %{"did" => did, "anchors" => ["anchor-a.example"]})

    assert {:ok, ppe} = Identity.get_ppe_by_did(did)
    assert ppe.profile_version == 7
    assert ppe.display_name == "Worker Alice"
  end

  test "tries the next anchor when the first fails" do
    did = "did:yawp:worker-fallback"

    envelope = %{
      "did" => did,
      ("public_" <> "key") => valid_pubkey(),
      "profile_version" => 3,
      "anchors" => ["good.example"],
      "display_name" => "Fallback"
    }

    Application.put_env(:yawp, Yawp.Federation.Client,
      req_options: [
        plug: fn conn ->
          if conn.host == "bad.example" do
            Plug.Conn.send_resp(conn, 500, "boom")
          else
            Req.Test.json(conn, %{"ppe" => envelope})
          end
        end
      ]
    )

    assert :ok =
             perform_job(PpeRefreshWorker, %{
               "did" => did,
               "anchors" => ["bad.example", "good.example"]
             })

    assert {:ok, ppe} = Identity.get_ppe_by_did(did)
    assert ppe.display_name == "Fallback"
  end

  defp perform_job(worker, args) do
    worker.perform(%Oban.Job{args: args})
  end
end
