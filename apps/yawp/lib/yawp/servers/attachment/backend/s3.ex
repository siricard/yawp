defmodule Yawp.Servers.Attachment.Backend.S3 do
  @moduledoc false

  def put(_upload_id, _bytes, _opts), do: {:error, :s3_backend_unavailable}

  def get(_ref), do: {:error, :s3_backend_unavailable}

  def delete(_ref), do: {:error, :s3_backend_unavailable}
end
