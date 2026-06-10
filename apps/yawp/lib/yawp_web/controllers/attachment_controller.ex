defmodule YawpWeb.AttachmentController do
  @moduledoc false

  use YawpWeb, :controller

  alias Yawp.Servers
  alias Yawp.Servers.Attachment.Backend.Local
  alias Yawp.Servers.Attachment.Backend.S3

  @default_max_attachment_bytes 25 * 1024 * 1024
  @default_max_attachments_per_message 10
  @default_download_ttl_seconds 300

  def upload(conn, %{"file" => %Plug.Upload{} = upload} = params) do
    upload_id = generate_upload_id()

    with {:ok, bytes} <- File.read(upload.path),
         :ok <- check_size(byte_size(bytes)),
         {:ok, backend_ref} <- backend().put(upload_id, bytes, backend_opts()),
         content_hash = sha256_hex(bytes),
         mime = upload.content_type || "application/octet-stream",
         {:ok, attachment} <-
           Servers.record_attachment_upload(%{
             upload_id: upload_id,
             content_hash: content_hash,
             mime: mime,
             size_bytes: byte_size(bytes),
             backend: backend_name(),
             backend_ref: backend_ref,
             uploaded_by_did: Map.get(params, "uploaded_by_did")
           }) do
      conn
      |> put_status(:created)
      |> json(%{
        upload_id: attachment.upload_id,
        content_hash: attachment.content_hash,
        mime: attachment.mime,
        size: attachment.size_bytes,
        size_bytes: attachment.size_bytes,
        download_url: download_url(attachment.upload_id)
      })
    else
      {:error, :too_large} ->
        conn
        |> put_status(413)
        |> json(%{
          error: "attachment_too_large",
          max_attachment_bytes: max_attachment_bytes()
        })

      {:error, :s3_backend_unavailable} ->
        conn
        |> put_status(:bad_request)
        |> json(%{error: "attachment_backend_unavailable"})

      _ ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "upload_failed"})
    end
  end

  def upload(conn, _params) do
    conn
    |> put_status(:bad_request)
    |> json(%{error: "missing_file"})
  end

  def download(conn, %{"upload_id" => upload_id, "sig" => sig, "exp" => exp}) do
    with {:ok, expires_at} <- parse_exp(exp),
         :ok <- verify_download(upload_id, expires_at, sig),
         {:ok, attachment} <- Servers.get_attachment_by_upload_id(upload_id),
         {:ok, path} <- local_path(attachment) do
      conn
      |> put_resp_content_type(attachment.mime)
      |> send_file(200, path)
    else
      {:error, :expired} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "download_url_expired"})

      _ ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "invalid_download_url"})
    end
  end

  def download(conn, _params) do
    conn
    |> put_status(:forbidden)
    |> json(%{error: "invalid_download_url"})
  end

  def sign_download(upload_id, expires_at) when is_binary(upload_id) and is_integer(expires_at) do
    :crypto.mac(:hmac, :sha256, download_secret(), "#{upload_id}|#{expires_at}")
    |> Base.url_encode64(padding: false)
  end

  def max_attachments_per_message do
    attachments_config()
    |> Keyword.get(:max_attachments_per_message, @default_max_attachments_per_message)
  end

  defp download_url(upload_id) do
    exp =
      DateTime.utc_now() |> DateTime.add(download_ttl_seconds(), :second) |> DateTime.to_unix()

    sig = sign_download(upload_id, exp)
    url(~p"/api/downloads/#{upload_id}?sig=#{sig}&exp=#{exp}")
  end

  defp verify_download(upload_id, expires_at, sig) do
    cond do
      expires_at < DateTime.utc_now() |> DateTime.to_unix() ->
        {:error, :expired}

      Plug.Crypto.secure_compare(sign_download(upload_id, expires_at), sig) ->
        :ok

      true ->
        {:error, :invalid_signature}
    end
  end

  defp parse_exp(exp) when is_binary(exp) do
    case Integer.parse(exp) do
      {value, ""} -> {:ok, value}
      _ -> {:error, :invalid_exp}
    end
  end

  defp check_size(size) do
    if size <= max_attachment_bytes(), do: :ok, else: {:error, :too_large}
  end

  defp local_path(%Servers.Attachment{backend: :local, backend_ref: ref}) do
    path = Path.join(Local.storage_root(), ref)
    if File.regular?(path), do: {:ok, path}, else: {:error, :not_found}
  end

  defp local_path(_attachment), do: {:error, :unsupported_backend}

  defp generate_upload_id do
    16
    |> :crypto.strong_rand_bytes()
    |> Base.url_encode64(padding: false)
  end

  defp sha256_hex(bytes), do: :crypto.hash(:sha256, bytes) |> Base.encode16(case: :lower)

  defp backend do
    case backend_name() do
      :local -> Local
      :s3 -> S3
    end
  end

  defp backend_name do
    attachments_config()
    |> Keyword.get(:backend, :local)
  end

  defp backend_opts, do: [root: Local.storage_root()]

  defp max_attachment_bytes do
    attachments_config()
    |> Keyword.get(:max_attachment_bytes, @default_max_attachment_bytes)
  end

  defp download_ttl_seconds do
    attachments_config()
    |> Keyword.get(:download_ttl_seconds, @default_download_ttl_seconds)
  end

  defp download_secret do
    attachments_config()
    |> Keyword.get_lazy(:download_secret, fn -> YawpWeb.Endpoint.config(:secret_key_base) end)
  end

  defp attachments_config, do: Application.get_env(:yawp, :attachments, [])
end
