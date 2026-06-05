defmodule Yawp.Federation do
  @moduledoc false

  use Ash.Domain, otp_app: :yawp

  alias Yawp.Federation.AnchorHost
  alias Yawp.Federation.Client
  alias Yawp.Federation.DeviceSignature
  alias Yawp.Federation.InboxEntry
  alias Yawp.Identity

  resources do
    resource Yawp.Federation.ServerKey do
      define :generate_server_key, action: :generate, args: []
      define :get_active_server_key, action: :get_active, not_found_error?: false
      define :list_published_server_keys, action: :list_published
      define :revoke_server_key, action: :revoke
    end

    resource Yawp.Federation.InboxEntry do
      define :append_inbox_entry, action: :append
      define :pull_inbox_entries, action: :pull
    end
  end

  @spec append_inbox(String.t(), map()) ::
          {:ok, InboxEntry.t()} | {:error, term()}
  def append_inbox(recipient_did, envelope, opts \\ [])
      when is_binary(recipient_did) and is_map(envelope) do
    result =
      append_inbox_entry(%{
        identity_id: recipient_did,
        recipient_did: recipient_did,
        envelope_id: Map.fetch!(envelope, "envelope_id"),
        conversation_id: Map.get(envelope, "conversation_id"),
        kind: Map.get(envelope, "kind", "dm"),
        ciphertext_envelope: envelope,
        envelope: envelope,
        wrapper_signature: Keyword.get(opts, :wrapper_signature),
        received_at: Keyword.get_lazy(opts, :received_at, &DateTime.utc_now/0)
      })

    with {:ok, %{__metadata__: %{inbox_created?: true}} = entry} <- result do
      bare = String.replace_prefix(recipient_did, "did:yawp:", "")

      Phoenix.PubSub.broadcast(
        Yawp.PubSub,
        YawpWeb.UserChannel.inbox_topic(bare),
        {:inbox, entry}
      )
    end

    result
  end

  @spec submit_dm(map()) :: {:ok, map()} | {:error, term()}
  def submit_dm(envelope) when is_map(envelope) do
    with :ok <- DeviceSignature.verify(envelope),
         {:ok, deliveries} <- deliver_dm(envelope) do
      {:ok, %{deliveries: deliveries}}
    end
  end

  def submit_dm(_), do: {:error, :invalid_envelope}

  @spec local_anchor_host() :: String.t()
  def local_anchor_host do
    Application.get_env(:yawp, Client, [])
    |> Keyword.get_lazy(:anchor_id, &endpoint_host/0)
    |> AnchorHost.normalize()
  end

  @spec pull_inbox(String.t(), integer(), integer()) ::
          {:ok, [Yawp.Federation.InboxEntry.t()]} | {:error, term()}
  def pull_inbox(recipient_did, since_serial \\ 0, limit \\ 1000)
      when is_binary(recipient_did) do
    pull_inbox_entries(%{
      recipient_did: recipient_did,
      since_serial: since_serial,
      limit: limit
    })
  end

  @spec ensure_active_server_key!() :: :ok
  def ensure_active_server_key! do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{}} ->
        :ok

      {:ok, nil} ->
        {:ok, key} = generate_server_key()
        require Logger
        Logger.info("Generated federation server key #{key.key_id}")
        :ok
    end
  end

  @spec sign(term(), keyword()) :: {:ok, binary(), String.t()} | {:error, :no_active_key}
  def sign(payload, _opts \\ []) do
    case get_active_server_key() do
      {:ok, %Yawp.Federation.ServerKey{} = key} ->
        canonical = Yawp.CanonicalJson.encode(payload)
        signature = :crypto.sign(:eddsa, :none, canonical, [key.private_key, :ed25519])
        {:ok, signature, key.key_id}

      {:ok, nil} ->
        {:error, :no_active_key}
    end
  end

  defp deliver_dm(envelope) do
    recipient_dids = Map.get(envelope, "recipient_dids")

    cond do
      is_list(recipient_dids) and recipient_dids != [] and Enum.all?(recipient_dids, &is_binary/1) ->
        recipient_dids
        |> recipient_anchor_targets()
        |> deliver_targets(envelope)

      is_binary(Map.get(envelope, "recipient_did")) ->
        [Map.fetch!(envelope, "recipient_did")]
        |> recipient_anchor_targets()
        |> deliver_targets(envelope)

      true ->
        {:error, :invalid_envelope}
    end
  end

  defp recipient_anchor_targets(recipient_dids) do
    recipient_dids
    |> Enum.flat_map(fn did ->
      did
      |> anchors_for_recipient()
      |> Enum.map(&{&1, did})
    end)
    |> Enum.group_by(fn {anchor, _did} -> anchor end, fn {_anchor, did} -> did end)
    |> Enum.into(%{}, fn {anchor, dids} -> {anchor, Enum.uniq(dids)} end)
  end

  defp deliver_targets(targets, envelope) do
    local = local_anchor_host()

    if map_size(targets) == 0 do
      {:error, :unresolvable_recipient}
    else
      targets
      |> Enum.reduce_while({:ok, []}, fn {anchor, dids}, {:ok, acc} ->
        result =
          if AnchorHost.normalize(anchor) == local do
            deliver_local(dids, envelope)
          else
            deliver_remote(anchor, envelope)
          end

        case result do
          :ok -> {:cont, {:ok, [%{anchor: anchor, recipients: dids} | acc]}}
          {:error, reason} -> {:halt, {:error, reason}}
        end
      end)
      |> case do
        {:ok, deliveries} -> {:ok, Enum.reverse(deliveries)}
        error -> error
      end
    end
  end

  defp deliver_local(dids, envelope) do
    Enum.reduce_while(dids, :ok, fn did, _acc ->
      case append_inbox(did, envelope) do
        {:ok, _} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp deliver_remote(anchor, envelope) do
    case Client.push_inbox!(anchor, envelope) do
      {:ok, _} -> :ok
      {:error, reason} -> {:error, reason}
    end
  end

  defp anchors_for_recipient(did) do
    case Identity.get_ppe_by_did(did) do
      {:ok, %Identity.Ppe{envelope: %{"anchors" => anchors}}} when is_list(anchors) ->
        anchors
        |> Enum.filter(&(is_binary(&1) and &1 != ""))
        |> Enum.map(&AnchorHost.normalize/1)
        |> Enum.uniq()

      _ ->
        []
    end
  end

  defp endpoint_host do
    url = Application.get_env(:yawp, YawpWeb.Endpoint, [])[:url] || []
    host = Keyword.get(url, :host, "localhost")

    case Keyword.get(url, :port) do
      nil -> host
      port -> "#{host}:#{port}"
    end
  end
end
