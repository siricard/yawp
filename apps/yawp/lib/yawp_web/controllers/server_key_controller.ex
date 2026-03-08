defmodule YawpWeb.ServerKeyController do
  @moduledoc """
  Publishes the anchor's federation server-key document at
  `GET /.well-known/yawp/server-key.json`. Public, no auth.

  See .
  """

  use YawpWeb, :controller

  alias Yawp.Federation.ServerKey

  def show(conn, _params) do
    keys = Enum.map(ServerKey.list_published(), &serialize_key/1)
    json(conn, %{"keys" => keys})
  end

  defp serialize_key(key) do
    encoded_pub = Base.url_encode64(key.public_key, padding: false)

    %{
      "key_id" => key.key_id,
      "alg" => "Ed25519",
      "public_key" => encoded_pub,
      "not_before" => DateTime.to_iso8601(key.not_before),
      "not_after" => DateTime.to_iso8601(key.not_after)
    }
  end
end
