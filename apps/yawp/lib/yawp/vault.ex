defmodule Yawp.Vault do
  @moduledoc """
  Cloak vault used by `ash_cloak` to encrypt sensitive attributes at
  rest.

  The cipher key is read at runtime from the `CLOAK_KEY` environment
  variable (base64-encoded, 32 raw bytes). Production REQUIRES this
  variable and fails closed (raises on boot) when it is missing.

  In `:dev` and `:test` only, a fixed fixture key is used when
  `CLOAK_KEY` is absent so the local boot and the test suite work
  without operator setup. This dev/test fallback is compile-time gated
  on `Mix.env` and therefore CANNOT be present in production builds.
  """

  use Cloak.Vault, otp_app: :yawp

  if Mix.env() in [:dev, :test] do
    @dev_key Base.decode64!("yEUMNo6jNF6jDbnImcjC0d+1bm6m/4cmZpDGLZpNB5w=")
    defp fallback_key, do: @dev_key
  else
    defp fallback_key do
      raise """
      CLOAK_KEY environment variable is missing or empty.

      Yawp uses CLOAK_KEY (base64-encoded 32-byte key) to encrypt the
      federation server private key at rest. Refusing to start without
      it.

      Generate one with:
          mix yawp.gen.cloak_key   # or: openssl rand -base64 32

      Then set:
          export CLOAK_KEY=...    # in your env / systemd unit / Docker compose

      See .env.example and docs/self-hosting.md.
      """
    end
  end

  @impl GenServer
  def init(config) do
    key =
      case System.get_env("CLOAK_KEY") do
        nil -> fallback_key()
        "" -> fallback_key()
        encoded -> Base.decode64!(encoded)
      end

    config =
      Keyword.put(config, :ciphers,
        default: {Cloak.Ciphers.AES.GCM, tag: "AES.GCM.V1", key: key, iv_length: 12}
      )

    {:ok, config}
  end
end
