defmodule Yawp.Vault do
  @moduledoc """
  Cloak vault used by `ash_cloak` to encrypt sensitive attributes at
  rest. Currently encrypts the federation server-key private key; future milestones may encrypt PPE bundles, recovery
  blobs, etc.

  The cipher key is read at runtime from the `CLOAK_KEY`
  environment variable (base64) when present, falling back to a
  fixed dev/test key so test runs and local boots work without any
  extra setup. Production deployments MUST set `CLOAK_KEY`.
  """

  use Cloak.Vault, otp_app: :yawp

  @dev_key Base.decode64!("yEUMNo6jNF6jDbnImcjC0d+1bm6m/4cmZpDGLZpNB5w=")

  @impl GenServer
  def init(config) do
    key =
      case System.get_env("CLOAK_KEY") do
        nil -> @dev_key
        "" -> @dev_key
        encoded -> Base.decode64!(encoded)
      end

    config =
      Keyword.put(config, :ciphers,
        default: {Cloak.Ciphers.AES.GCM, tag: "AES.GCM.V1", key: key, iv_length: 12}
      )

    {:ok, config}
  end
end
