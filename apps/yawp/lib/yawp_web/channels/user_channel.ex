defmodule YawpWeb.UserChannel do
  @moduledoc false

  use Phoenix.Channel

  alias Yawp.Federation.PresenceBroker
  alias Yawp.Identity
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
      is_request: entry.is_request,
      inbox_serial: entry.inbox_serial,
      sender_display_name: sender_display_name(entry.envelope),
      envelope: entry.envelope
    })

    {:noreply, socket}
  end

  @impl true
  def handle_info({:delivery_state, state}, socket) do
    push(socket, "delivery_state", state)
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
      forward_read_marker(payload, socket)

      broadcast!(socket, "read_marker", %{
        conversation_id: Map.fetch!(payload, "conversation_id"),
        last_read_envelope_id: Map.fetch!(payload, "last_read_envelope_id"),
        signed_by: Map.fetch!(payload, "signed_by"),
        sender_signature: Map.fetch!(payload, "sender_signature"),
        ts: Map.fetch!(payload, "ts")
      })

      {:reply, :ok, socket}
    else
      {:reply, {:error, %{reason: "invalid_payload"}}, socket}
    end
  end

  @spec inbox_topic(String.t()) :: String.t()
  def inbox_topic(bare_did), do: "user_inbox:#{bare_did}"

  defp sender_display_name(%{"sender_did" => did}) when is_binary(did) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{display_name: name}} when is_binary(name) and name != "" -> name
      _ -> nil
    end
  end

  defp sender_display_name(_), do: nil

  defp valid_delivery_ack?(%{
         "envelope_id" => env,
         "signed_by" => sb,
         "signature" => sig,
         "ts" => ts
       }) do
    is_binary(env) and is_binary(sb) and is_binary(sig) and is_integer(ts)
  end

  defp valid_delivery_ack?(_), do: false

  defp valid_read_marker?(
         %{
           "conversation_id" => conv,
           "last_read_envelope_id" => envelope_id,
           "sender_anchor" => anchor,
           "signed_by" => sb,
           "sender_signature" => sig,
           "ts" => ts
         } = payload
       ) do
    is_binary(conv) and is_binary(envelope_id) and is_binary(anchor) and is_binary(sb) and
      is_binary(sig) and
      is_integer(ts) and
      valid_device_signature?(payload)
  end

  defp valid_read_marker?(_), do: false

  defp forward_read_marker(
         %{"sender_anchor" => anchor, "last_read_envelope_id" => envelope_id} = payload,
         socket
       )
       when is_binary(anchor) and is_binary(envelope_id) do
    recipient_did = "did:yawp:" <> socket.assigns.did

    case Identity.get_identity_by_did(recipient_did) do
      {:ok, %IdentityResource{read_receipts_enabled: false}} ->
        :ok

      _ ->
        marker =
          sign_server_message(%{
            "conversation_id" => Map.fetch!(payload, "conversation_id"),
            "recipient_did" => recipient_did,
            "last_read_envelope_id" => envelope_id,
            "last_read_at" => DateTime.utc_now() |> DateTime.to_iso8601()
          })

        spawn(fn ->
          try do
            Yawp.Federation.Client.push_read_marker!(anchor, marker)
          rescue
            _ -> :ok
          catch
            _, _ -> :ok
          end
        end)

        :ok
    end
  end

  defp forward_read_marker(_, _), do: :ok

  defp valid_device_signature?(payload) do
    payload
    |> Map.put("sender_did", Map.get(payload, "sender_did") || Map.get(payload, "recipient_did"))
    |> Yawp.Federation.DeviceSignature.verify()
    |> Kernel.==(:ok)
  end

  defp sign_server_message(unsigned) do
    {:ok, signature, key_id} = Yawp.Federation.sign(unsigned)

    unsigned
    |> Map.put("key_id", key_id)
    |> Map.put("server_signature", Base.encode64(signature))
  end

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
