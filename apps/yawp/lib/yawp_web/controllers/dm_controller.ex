defmodule YawpWeb.DmController do
  @moduledoc false

  use YawpWeb, :controller

  alias Yawp.Federation

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

      {:error, _} ->
        conn
        |> put_status(422)
        |> json(%{"error" => "invalid_envelope"})
    end
  end

  defp serialize_delivery(%{anchor: anchor, recipients: recipients}) do
    %{"anchor" => anchor, "recipients" => recipients}
  end
end
