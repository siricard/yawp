defmodule Yawp.Servers.Attachment.Backend.Local do
  @moduledoc false

  def put(upload_id, bytes, opts) when is_binary(upload_id) and is_binary(bytes) do
    root = Keyword.fetch!(opts, :root)
    ref = sharded_ref(upload_id)
    path = Path.join(root, ref)

    with :ok <- File.mkdir_p(Path.dirname(path)),
         :ok <- File.write(path, bytes, [:binary]) do
      {:ok, ref}
    end
  end

  def get(ref) when is_binary(ref) do
    root = storage_root()
    File.read(Path.join(root, ref))
  end

  def delete(ref) when is_binary(ref) do
    root = storage_root()

    case File.rm(Path.join(root, ref)) do
      :ok -> :ok
      {:error, :enoent} -> :ok
      error -> error
    end
  end

  def sharded_ref(upload_id) do
    safe = String.replace(upload_id, ~r/[^A-Za-z0-9_-]/, "")
    shard_a = String.slice(safe, 0, 2) || "00"
    shard_b = String.slice(safe, 2, 2) || "00"
    Path.join([shard_a, shard_b, safe])
  end

  def storage_root do
    Application.get_env(:yawp, :attachments, [])
    |> Keyword.get(:storage_path, Path.join(:code.priv_dir(:yawp), "uploads"))
  end
end
