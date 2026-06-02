defmodule Yawp.Federation.Wrapper do
  @moduledoc """
  Signed delivery wrapper for anchor-to-anchor federation traffic.

  When an anchor relays an inner envelope (DM envelope, sync message,
  notification) to a peer anchor, it wraps it in a small map —
  `delivery_nonce`, `delivery_timestamp`, `sender_anchor_id`,
  `inner_payload_hash` — canonicalises that map per RFC 8785, and signs
  the canonical bytes with the anchor's active server key. The inner
  envelope travels alongside the wrapper and is bound to the signature
  by its SHA-256 hash.

  `wrap/2` produces `{wrapped_payload_string, signature_bytes, key_id}`.
  `encode_body/2` packages those plus the inner envelope into the JSON
  body posted over HTTP. `unwrap/2` reverses it: it verifies the
  sender anchor's server signature against the published key document
  (via `Yawp.Federation.KeyDocFetcher`), rebinds the inner payload by
  hash, and rejects replays on `delivery_nonce`.

  The inner envelope's own `sender_signature` (the user-side signature)
  is verified separately at the resource layer — this module only
  authenticates the relaying anchor.
  """

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
         sender_anchor_id when is_binary(sender_anchor_id) <-
           Map.get(wrapper, "sender_anchor_id", :missing),
         true <- verify_signature(sender_anchor_id, key_id, wrapped, signature),
         :ok <- verify_payload_hash(wrapper, inner),
         :ok <- DeliveryNonceCache.record(Map.fetch!(wrapper, "delivery_nonce")) do
      {:ok, inner, sender_anchor_id}
    end
  end

  def unwrap(_body, _opts), do: {:error, :malformed}

  defp verify_signature(sender_anchor_id, key_id, wrapped, signature) do
    if KeyDocFetcher.verify_with(sender_anchor_id, key_id, wrapped, signature) do
      true
    else
      {:error, :invalid_signature}
    end
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
