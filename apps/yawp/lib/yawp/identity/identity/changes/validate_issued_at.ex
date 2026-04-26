defmodule Yawp.Identity.Identity.Changes.ValidateIssuedAt do
  @moduledoc """
  fix2 — validates the opaque `issued_at` argument is a
  parseable ISO-8601 UTC timestamp AND within the 5-minute replay
  window around server time. Any failure → `RpcError type:
  "invalid_payload"`.

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
    issued_at = Ash.Changeset.get_argument(changeset, :issued_at)

    with true <- is_binary(issued_at),
         {:ok, dt, _offset} <- DateTime.from_iso8601(issued_at),
         true <- within_window?(dt) do
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
