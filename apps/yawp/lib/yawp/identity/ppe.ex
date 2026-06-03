defmodule Yawp.Identity.Ppe do
  @moduledoc """
  Cached Public Profile Envelope for an identity, keyed by DID.

  An anchor stores the canonical, user-signed PPE for each of its
  users; a guest server caches the PPEs of users present in its rooms
  so it can render display names and avatars. Both populate this table
  via the federation push/pull path.

  Conflict resolution is by `profile_version`: a higher version wins,
  a lower-or-equal version is a no-op. The full signed envelope is kept
  in `envelope` so the strict schema validation and signature checks
  can read every field; the frequently-queried fields (`display_name`,
  `avatar_ref`, `bio`) are promoted to their own columns.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Identity,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "identity_ppes"
    repo Yawp.Repo
  end

  actions do
    defaults [:read]

    create :upsert do
      description "Inserts or overwrites the cached PPE for a DID. Apply-if-newer is enforced by the caller before invoking this action."

      accept [:did, :display_name, :avatar_ref, :bio, :profile_version, :envelope]
      upsert? true
      upsert_identity :unique_did
    end

    read :get_by_did do
      description "Look up a cached PPE by DID."
      get_by [:did]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :did, :string do
      allow_nil? false
      public? true
      description "did:yawp:<...> the PPE belongs to."
    end

    attribute :display_name, :string do
      allow_nil? true
      public? true
    end

    attribute :avatar_ref, :string do
      allow_nil? true
      public? true
    end

    attribute :bio, :string do
      allow_nil? true
      public? true
    end

    attribute :profile_version, :integer do
      allow_nil? false
      default 0
      public? true
      description "Monotonic version from the signed envelope; higher wins on conflict."
    end

    attribute :envelope, :map do
      allow_nil? false
      public? true
      description "The full user-signed PPE payload as received over federation."
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :unique_did, [:did]
  end

  @type t :: %__MODULE__{}

  @display_name_max 100
  @bio_max 1000

  @doc """
  Validates the strict shape of a user-signed PPE envelope before it
  is cached. Returns `:ok` for a well-formed envelope, or
  `{:error, reason}` naming the first field that failed.

  Required: `did` (non-blank string), `public_key` (base64/base64url of
  a 32-byte Ed25519 key), `profile_version` (non-negative integer),
  `anchors` (list of valid hosts). Optional: `display_name`
  (≤ #{@display_name_max} chars), `avatar_ref` (a URL or `yawp://` ref),
  `bio` (≤ #{@bio_max} chars), `device_subkeys` (list of valid records).
  """
  @spec validate(map()) :: :ok | {:error, atom()}
  def validate(envelope) when is_map(envelope) do
    with :ok <- validate_did(envelope),
         :ok <- validate_public_key(envelope),
         :ok <- validate_profile_version(envelope),
         :ok <- validate_anchors(envelope),
         :ok <- validate_display_name(envelope),
         :ok <- validate_avatar_ref(envelope),
         :ok <- validate_bio(envelope) do
      validate_device_subkeys(envelope)
    end
  end

  def validate(_), do: {:error, :not_a_map}

  defp validate_did(%{"did" => did}) when is_binary(did) and did != "", do: :ok
  defp validate_did(_), do: {:error, :invalid_did}

  defp validate_public_key(%{"public_key" => pk}) when is_binary(pk) do
    if decode_key(pk, 32), do: :ok, else: {:error, :invalid_public_key}
  end

  defp validate_public_key(_), do: {:error, :invalid_public_key}

  defp validate_profile_version(%{"profile_version" => v}) when is_integer(v) and v >= 0, do: :ok
  defp validate_profile_version(_), do: {:error, :invalid_profile_version}

  defp validate_anchors(%{"anchors" => anchors}) when is_list(anchors) and anchors != [] do
    if Enum.all?(anchors, &valid_host?/1), do: :ok, else: {:error, :invalid_anchors}
  end

  defp validate_anchors(_), do: {:error, :invalid_anchors}

  defp validate_display_name(%{"display_name" => name}) when not is_nil(name) do
    if is_binary(name) and String.length(name) <= @display_name_max do
      :ok
    else
      {:error, :invalid_display_name}
    end
  end

  defp validate_display_name(_), do: :ok

  defp validate_avatar_ref(%{"avatar_ref" => ref}) when not is_nil(ref) do
    if is_binary(ref) and valid_avatar_ref?(ref), do: :ok, else: {:error, :invalid_avatar_ref}
  end

  defp validate_avatar_ref(_), do: :ok

  defp validate_bio(%{"bio" => bio}) when not is_nil(bio) do
    if is_binary(bio) and String.length(bio) <= @bio_max, do: :ok, else: {:error, :invalid_bio}
  end

  defp validate_bio(_), do: :ok

  defp validate_device_subkeys(%{"device_subkeys" => subkeys}) when not is_nil(subkeys) do
    if is_list(subkeys) and Enum.all?(subkeys, &valid_subkey_record?/1) do
      :ok
    else
      {:error, :invalid_device_subkeys}
    end
  end

  defp validate_device_subkeys(_), do: :ok

  defp valid_subkey_record?(%{
         "device_id" => device_id,
         "pk" => pk,
         "signature" => signature,
         "issued_at" => issued_at
       })
       when is_binary(device_id) and device_id != "" and is_binary(issued_at) do
    decode_key(pk, 32) && decode_key(signature, 64)
  end

  defp valid_subkey_record?(_), do: false

  defp valid_host?(host) when is_binary(host) do
    Regex.match?(~r/^[a-zA-Z0-9.-]+(:\d+)?$/, host)
  end

  defp valid_host?(_), do: false

  defp valid_avatar_ref?(ref) do
    String.starts_with?(ref, "https://") or String.starts_with?(ref, "yawp://")
  end

  defp decode_key(value, byte_length) when is_binary(value) do
    raw = String.replace_prefix(value, "ed25519:", "")

    decoded =
      case Base.url_decode64(raw, padding: false) do
        {:ok, bytes} -> {:ok, bytes}
        :error -> Base.decode64(raw, padding: false)
      end

    case decoded do
      {:ok, bytes} when byte_size(bytes) == byte_length -> true
      _ -> false
    end
  end

  defp decode_key(_, _), do: false
end
