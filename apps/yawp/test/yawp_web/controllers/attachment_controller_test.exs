defmodule YawpWeb.AttachmentControllerTest do
  use YawpWeb.ConnCase, async: false

  @secret "attachment-test-secret"

  setup do
    uploads_root =
      Path.join(System.tmp_dir!(), "yawp-attachment-test-#{System.unique_integer([:positive])}")

    previous = Application.get_env(:yawp, :attachments, [])

    Application.put_env(:yawp, :attachments,
      backend: :local,
      storage_path: uploads_root,
      download_secret: @secret,
      max_attachment_bytes: 16,
      max_attachments_per_message: 10
    )

    on_exit(fn ->
      Application.put_env(:yawp, :attachments, previous)
      File.rm_rf(uploads_root)
    end)

    %{uploads_root: uploads_root}
  end

  test "upload stores bytes on disk and records their sha256 hash", %{
    conn: conn,
    uploads_root: uploads_root
  } do
    upload = upload_fixture("hello attachment", "note.txt", "text/plain")
    expected_hash = :crypto.hash(:sha256, "hello attachment") |> Base.encode16(case: :lower)

    conn =
      post(conn, ~p"/api/uploads", %{"file" => upload, "uploaded_by_did" => "did:yawp:alice"})

    assert %{
             "upload_id" => upload_id,
             "content_hash" => ^expected_hash,
             "mime" => "text/plain",
             "size" => 16,
             "download_url" => download_url
           } = json_response(conn, 201)

    assert {:ok, attachment} = Yawp.Servers.get_attachment_by_upload_id(upload_id)
    assert attachment.content_hash == expected_hash
    assert attachment.uploaded_by_did == "did:yawp:alice"
    assert File.regular?(Path.join(uploads_root, attachment.backend_ref))

    uri = URI.parse(download_url)
    params = URI.decode_query(uri.query)

    conn =
      build_conn()
      |> get(uri.path <> "?" <> URI.encode_query(params))

    assert response(conn, 200) == "hello attachment"
    assert [content_type] = get_resp_header(conn, "content-type")
    assert String.starts_with?(content_type, "text/plain")
  end

  test "upload rejects files over the configured cap", %{conn: conn} do
    upload = upload_fixture("too large for cap", "large.txt", "text/plain")

    conn = post(conn, ~p"/api/uploads", %{"file" => upload})

    assert %{"error" => "attachment_too_large", "max_attachment_bytes" => 16} =
             json_response(conn, 413)
  end

  test "download rejects expired signatures", %{conn: conn} do
    upload = upload_fixture("download me", "note.txt", "text/plain")

    conn = post(conn, ~p"/api/uploads", %{"file" => upload})
    %{"upload_id" => upload_id} = json_response(conn, 201)

    exp = DateTime.utc_now() |> DateTime.add(-1, :second) |> DateTime.to_unix()
    sig = YawpWeb.AttachmentController.sign_download(upload_id, exp)

    conn = get(build_conn(), ~p"/api/downloads/#{upload_id}?sig=#{sig}&exp=#{exp}")

    assert json_response(conn, 403) == %{"error" => "download_url_expired"}
  end

  defp upload_fixture(body, filename, content_type) do
    path = Path.join(System.tmp_dir!(), "yawp-upload-#{System.unique_integer([:positive])}")
    File.write!(path, body)

    %Plug.Upload{path: path, filename: filename, content_type: content_type}
  end
end
