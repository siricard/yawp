defmodule Yawp.Identity.Identity.Changes.DecodeBindPayload do
  @moduledoc """
  base64url-decodes `device_pk` (32 bytes), `device_signature`
  (64 bytes), and `sender_signature` (64 bytes); stashes the raw bytes
  on the changeset context as `:device_pk_bytes`, `:device_sig_bytes`,
  and `:sender_sig_bytes`. On any shape failure adds an
  `invalid_payload`-typed RPC error and halts the pipeline.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &decode/1)
  end

  defp decode(%{valid?: false} = changeset), do: changeset

  defp decode(changeset) do
    device_pk_b64 = Ash.Changeset.get_argument(changeset, :device_pk)
    device_sig_b64 = Ash.Changeset.get_argument(changeset, :device_signature)
    sender_sig_b64 = Ash.Changeset.get_argument(changeset, :sender_signature)

    with {:ok, device_pk} <- decode_b64(device_pk_b64, 32),
         {:ok, device_sig} <- decode_b64(device_sig_b64, 64),
         {:ok, sender_sig} <- decode_b64(sender_sig_b64, 64) do
      changeset
      |> Ash.Changeset.put_context(:device_pk_bytes, device_pk)
      |> Ash.Changeset.put_context(:device_sig_bytes, device_sig)
      |> Ash.Changeset.put_context(:sender_sig_bytes, sender_sig)
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "invalid_payload", message: "invalid_payload")
        )
    end
  end

  defp decode_b64(nil, _), do: :error

  defp decode_b64(b64, expected_size) when is_binary(b64) do
    case Base.url_decode64(b64, padding: false) do
      {:ok, raw} when byte_size(raw) == expected_size -> {:ok, raw}
      _ -> :error
    end
  end

  defp decode_b64(_, _), do: :error
end
