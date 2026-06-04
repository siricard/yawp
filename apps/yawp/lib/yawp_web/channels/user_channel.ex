defmodule YawpWeb.UserChannel do
  @moduledoc false

  use Phoenix.Channel

  alias Yawp.Federation.PresenceBroker
  alias Yawp.Identity.Identity, as: IdentityResource
  alias YawpWeb.Presence

  @impl true
  def join("user:" <> bare_did, params, socket) do
    identity = socket.assigns[:current_identity]

    with %IdentityResource{} = identity <- identity,
         true <- byte_size(bare_did) > 0,
         true <- bare(identity.did) == bare_did do
      send(self(), :after_join)

      Phoenix.PubSub.subscribe(Yawp.PubSub, inbox_topic(bare_did))

      {:ok,
       socket
       |> assign(:did, bare_did)
       |> assign(:guest_anchors, guest_anchors(params))}
    else
      _ -> {:error, %{reason: "unauthorized"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    {:ok, _} =
      Presence.track(socket, socket.assigns.did, %{
        online_at: System.system_time(:second)
      })

    push(socket, "presence_state", Presence.list(socket))

    PresenceBroker.subscribe_peers(
      "did:yawp:" <> socket.assigns.did,
      socket.assigns.guest_anchors
    )

    {:noreply, socket}
  end

  @impl true
  def handle_info({:inbox, entry}, socket) do
    push(socket, "inbox", %{
      envelope_id: entry.envelope_id,
      conversation_id: entry.conversation_id,
      kind: entry.kind,
      inbox_serial: entry.inbox_serial,
      envelope: entry.envelope
    })

    {:noreply, socket}
  end

  @impl true
  def handle_in("delivery_ack", payload, socket) do
    if valid_delivery_ack?(payload) do
      broadcast!(socket, "delivery_ack", %{
        envelope_id: Map.fetch!(payload, "envelope_id"),
        conversation_id: Map.get(payload, "conversation_id"),
        signed_by: Map.fetch!(payload, "signed_by"),
        signature: Map.fetch!(payload, "signature"),
        ts: Map.fetch!(payload, "ts")
      })

      {:reply, :ok, socket}
    else
      {:reply, {:error, %{reason: "invalid_payload"}}, socket}
    end
  end

  @impl true
  def handle_in("read_marker", payload, socket) do
    if valid_read_marker?(payload) do
      broadcast!(socket, "read_marker", %{
        conversation_id: Map.fetch!(payload, "conversation_id"),
        up_to_serial: Map.fetch!(payload, "up_to_serial"),
        signed_by: Map.fetch!(payload, "signed_by"),
        signature: Map.fetch!(payload, "signature"),
        ts: Map.fetch!(payload, "ts")
      })

      {:reply, :ok, socket}
    else
      {:reply, {:error, %{reason: "invalid_payload"}}, socket}
    end
  end

  @spec inbox_topic(String.t()) :: String.t()
  def inbox_topic(bare_did), do: "user_inbox:#{bare_did}"

  defp valid_delivery_ack?(%{
         "envelope_id" => env,
         "signed_by" => sb,
         "signature" => sig,
         "ts" => ts
       }) do
    is_binary(env) and is_binary(sb) and is_binary(sig) and is_integer(ts)
  end

  defp valid_delivery_ack?(_), do: false

  defp valid_read_marker?(%{
         "conversation_id" => conv,
         "up_to_serial" => serial,
         "signed_by" => sb,
         "signature" => sig,
         "ts" => ts
       }) do
    is_binary(conv) and is_integer(serial) and is_binary(sb) and is_binary(sig) and
      is_integer(ts)
  end

  defp valid_read_marker?(_), do: false

  defp guest_anchors(params) do
    case params do
      %{"guest_anchors" => anchors} when is_list(anchors) ->
        Enum.filter(anchors, &(is_binary(&1) and &1 != ""))

      _ ->
        []
    end
  end

  defp bare("did:yawp:" <> base58), do: base58
  defp bare(other) when is_binary(other), do: other
end
