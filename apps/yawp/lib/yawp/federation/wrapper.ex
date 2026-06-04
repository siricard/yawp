defmodule Yawp.Federation.Wrapper do
  @moduledoc false

  alias Yawp.CanonicalJson
  alias Yawp.Federation
  alias Yawp.Federation.DeliveryNonceCache
  alias Yawp.Federation.KeyDocFetcher

  @type inner :: map()
  @type opts :: keyword()

  @spec wrap(inner(), opts()) :: {String.t(), binary(), String.t()}
  def wrap(inner, opts) when is_map(inner) do
    sender_anchor_id = Keyword.fetch!(opts, :sender_anchor_id)

    wrapper = %{
      "delivery_nonce" => Keyword.get_lazy(opts, :delivery_nonce, &random_nonce/0),
      "delivery_timestamp" => Keyword.get_lazy(opts, :delivery_timestamp, &now_iso8601/0),
      "sender_anchor_id" => sender_anchor_id,
      "inner_payload_hash" => inner_payload_hash(inner)
    }

    canonical = CanonicalJson.encode(wrapper)
    {:ok, signature, key_id} = Federation.sign(wrapper)
    {canonical, signature, key_id}
  end

  @spec encode_body(inner(), opts()) :: String.t()
  def encode_body(inner, opts) when is_map(inner) do
    {wrapped, signature, key_id} = wrap(inner, opts)

    Jason.encode!(%{
      "wrapper" => wrapped,
      "signature" => Base.encode64(signature),
      "key_id" => key_id,
      "inner" => inner
    })
  end

  @spec unwrap(String.t() | map(), opts()) ::
          {:ok, inner(), String.t()} | {:error, atom()}
  def unwrap(body, _opts) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, decoded} -> unwrap(decoded, [])
      {:error, _} -> {:error, :malformed}
    end
  end

  def unwrap(
        %{
          "wrapper" => wrapped,
          "signature" => signature_b64,
          "key_id" => key_id,
          "inner" => inner
        },
        _opts
      )
      when is_binary(wrapped) and is_binary(signature_b64) and is_binary(key_id) and
             is_map(inner) do
    with {:ok, signature} <- decode_signature(signature_b64),
         {:ok, wrapper} <- decode_wrapper(wrapped),
         {:ok, sender_anchor_id} <- fetch_string(wrapper, "sender_anchor_id"),
         {:ok, delivery_nonce} <- fetch_string(wrapper, "delivery_nonce"),
         true <- verify_signature(sender_anchor_id, key_id, wrapped, signature),
         :ok <- verify_payload_hash(wrapper, inner),
         :ok <- DeliveryNonceCache.record(delivery_nonce) do
      {:ok, inner, sender_anchor_id}
    end
  end

  def unwrap(_body, _opts), do: {:error, :malformed}

  defp fetch_string(wrapper, key) do
    case Map.get(wrapper, key) do
      value when is_binary(value) -> {:ok, value}
      _ -> {:error, :malformed}
    end
  end

  defp verify_signature(sender_anchor_id, key_id, wrapped, signature) do
    case safe_verify_with(sender_anchor_id, key_id, wrapped, signature) do
      true -> true
      _ -> {:error, :invalid_signature}
    end
  end

  defp safe_verify_with(sender_anchor_id, key_id, wrapped, signature) do
    KeyDocFetcher.verify_with(sender_anchor_id, key_id, wrapped, signature)
  rescue
    _ -> false
  catch
    _, _ -> false
  end

  defp verify_payload_hash(wrapper, inner) do
    if Map.get(wrapper, "inner_payload_hash") == inner_payload_hash(inner) do
      :ok
    else
      {:error, :payload_hash_mismatch}
    end
  end

  defp decode_signature(signature_b64) do
    case Base.decode64(signature_b64) do
      {:ok, signature} -> {:ok, signature}
      :error -> {:error, :malformed}
    end
  end

  defp decode_wrapper(wrapped) do
    case Jason.decode(wrapped) do
      {:ok, %{} = wrapper} -> {:ok, wrapper}
      _ -> {:error, :malformed}
    end
  end

  defp inner_payload_hash(inner) do
    inner
    |> CanonicalJson.encode()
    |> then(&:crypto.hash(:sha256, &1))
    |> Base.encode16(case: :lower)
  end

  defp random_nonce do
    16 |> :crypto.strong_rand_bytes() |> Base.encode16(case: :lower)
  end

  defp now_iso8601 do
    DateTime.utc_now() |> DateTime.truncate(:millisecond) |> DateTime.to_iso8601()
  end
end
