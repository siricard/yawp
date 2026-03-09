defmodule Yawp.Hkdf do
  @moduledoc """
  RFC 5869 — HKDF with SHA-256. Byte-for-byte equivalent to the TypeScript
  implementation at `apps/yawp/assets/app/identity/hkdf.ts`.
  """

  @hash :sha256
  @hash_len 32

  @spec derive(binary(), binary(), binary(), pos_integer()) :: binary()
  def derive(ikm, salt, info, length)
      when is_binary(ikm) and is_binary(salt) and is_binary(info) and
             is_integer(length) and length > 0 do
    if length > 255 * @hash_len do
      raise ArgumentError, "HKDF: cannot derive more than 255 * HashLen bytes"
    end

    prk = :crypto.mac(:hmac, @hash, salt, ikm)
    expand(prk, info, length)
  end

  defp expand(prk, info, length) do
    n = div(length + @hash_len - 1, @hash_len)

    {acc, _last} =
      Enum.reduce(1..n, {<<>>, <<>>}, fn i, {acc, prev} ->
        t = :crypto.mac(:hmac, @hash, prk, prev <> info <> <<i::8>>)
        {acc <> t, t}
      end)

    binary_part(acc, 0, length)
  end
end
