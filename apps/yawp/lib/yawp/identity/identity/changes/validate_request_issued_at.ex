defmodule Yawp.Identity.Identity.Changes.ValidateRequestIssuedAt do
  @moduledoc """
  fix3 — validates the opaque `request_issued_at` argument is a
  parseable ISO-8601 UTC timestamp AND within the 5-minute replay
  window around server time. Any failure → `RpcError type:
  "invalid_payload"`.

  `request_issued_at` is the freshness anchor for THIS bind request
  signed by the device subkey via `sender_signature`. The companion
  `device_issued_at` argument (the master-signed device delegation
  timestamp) is NOT subject to this window; it is a stable attestation
  captured when the subkey was generated.

  The string itself is consumed verbatim by downstream canonical-JSON
  encoders; this change only gates semantic validity. will tighten
  the freshness window and surface it as a config knob.
  """
  use Ash.Resource.Change

  alias Yawp.RpcError

    @window_seconds 5 * 60

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, &validate/1)
  end

  defp validate(%{valid?: false} = changeset), do: changeset

  defp validate(changeset) do
    request_issued_at = Ash.Changeset.get_argument(changeset, :request_issued_at)
    device_issued_at = Ash.Changeset.get_argument(changeset, :device_issued_at)

    with true <- is_binary(request_issued_at),
         true <- is_binary(device_issued_at),
                                    {:ok, _device_dt, _device_offset} <- DateTime.from_iso8601(device_issued_at),
         {:ok, request_dt, _request_offset} <- DateTime.from_iso8601(request_issued_at),
         true <- within_window?(request_dt) do
      changeset
    else
      _ ->
        Ash.Changeset.add_error(
          changeset,
          RpcError.exception(type: "invalid_payload", message: "invalid_payload")
        )
    end
  end

  defp within_window?(%DateTime{} = dt) do
    abs(DateTime.diff(DateTime.utc_now(), dt, :second)) <= @window_seconds
  end
end
