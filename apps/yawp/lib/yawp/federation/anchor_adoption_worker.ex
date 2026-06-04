defmodule Yawp.Federation.AnchorAdoptionWorker do
  @moduledoc """
  Drives the second-anchor adoption handshake.

  Enqueued by the `:add_anchor` action when a user adds a new anchor
  host. The worker reads the user's canonical PPE from local state,
  posts a signed adoption envelope to the new anchor (proving the user
  already exists at this anchor and handing over the signed PPE), then
  replicates the user's private blob ciphertext to the new anchor so
  it holds a full copy of the user's data.

  Each POST rides inside the standard signed delivery wrapper
  (`Yawp.Federation.Client`), so the receiving anchor authenticates
  this anchor's server signature before applying anything.
  """

  use Oban.Worker, queue: :default, max_attempts: 5

  alias Yawp.Federation.Client
  alias Yawp.Identity

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"did" => did, "new_anchor" => new_anchor}})
      when is_binary(did) and is_binary(new_anchor) do
    with {:ok, ppe} <- fetch_local_ppe(did),
         {:ok, _} <- Client.adopt!(new_anchor, adoption_envelope(did, ppe)),
         :ok <- replicate_blob(new_anchor, did) do
      :ok
    end
  end

  defp fetch_local_ppe(did) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{envelope: envelope}} when is_map(envelope) -> {:ok, envelope}
      _ -> {:error, :no_local_ppe}
    end
  end

  defp adoption_envelope(did, ppe) do
    %{
      "did" => did,
      "master_public_key" => Map.get(ppe, "public_key"),
      "ppe" => ppe,
      "source_anchor" => this_anchor()
    }
  end

  defp replicate_blob(new_anchor, did) do
    case Identity.get_private_blob_by_did(did) do
      {:ok,
       %Identity.PrivateBlob{
         ciphertext: ciphertext,
         blob_version: version,
         public_key: public_key,
         signature: signature
       }} ->
        blob = %{
          "did" => did,
          "ciphertext" => Base.encode64(ciphertext),
          "blob_version" => version,
          "public_key" => public_key,
          "signature" => signature
        }

        case Client.push_blob!(new_anchor, blob) do
          {:ok, _} -> :ok
          {:error, _} = err -> err
        end

      _ ->
        :ok
    end
  end

  defp this_anchor do
    Application.get_env(:yawp, Yawp.Federation.Client, [])
    |> Keyword.get_lazy(:anchor_id, fn -> YawpWeb.Endpoint.url() end)
  end
end
