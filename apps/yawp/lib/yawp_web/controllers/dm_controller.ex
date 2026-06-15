defmodule YawpWeb.DmController do
  @moduledoc false

  use YawpWeb, :controller

  alias Yawp.Federation
  require Logger

  def immutable_roster(conn, _params) do
    conn
    |> put_status(409)
    |> json(%{"error" => "conversation_roster_immutable"})
  end

  def submit(conn, params) do
    envelope = Map.get(params, "envelope", params)

    case Federation.submit_dm(envelope) do
      {:ok, result} ->
        json(conn, %{
          "status" => "accepted",
          "deliveries" => Enum.map(result.deliveries, &serialize_delivery/1)
        })

      {:error, :invalid_inner_signature} ->
        conn
        |> put_status(403)
        |> json(%{"error" => "invalid_inner_signature"})

      {:error, :unresolvable_sender} ->
        conn
        |> put_status(422)
        |> json(%{"error" => "unresolvable_sender"})

      {:error, reason} ->
        Logger.warning("DM submit rejected: #{inspect(reason)}")

        conn
        |> put_status(422)
        |> json(%{"error" => "invalid_envelope"})
    end
  end

  defp serialize_delivery(%{anchor: anchor, recipients: recipients}) do
    %{"anchor" => anchor, "recipients" => recipients}
  end
end
