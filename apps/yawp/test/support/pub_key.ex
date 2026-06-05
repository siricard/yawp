defmodule Yawp.TestSupport.PubKey do
  @moduledoc false

  @spec pubkey_b64(binary()) :: String.t()
  def pubkey_b64(pk), do: Base.url_encode64(pk, padding: false)
end
