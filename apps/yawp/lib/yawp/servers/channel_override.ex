defmodule Yawp.Servers.ChannelOverride do
  @moduledoc """
  A per-channel adjustment to the permissions a role or a specific
  identity holds in one channel (ADR 017).

  An override targets either a role (`role_id`) or a single identity
  (`identity_id`) — never both — and carries an `allow_bits` and a
  `deny_bits` mask layered on top of the server-wide baseline by
  `Yawp.Servers.Permissions.effective_bits/3`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Servers,
    data_layer: AshPostgres.DataLayer

  postgres do
    table "server_channel_overrides"
    repo Yawp.Repo

    references do
      reference :channel, on_delete: :delete
      reference :role, on_delete: :delete
      reference :identity, on_delete: :delete
    end
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:channel_id, :role_id, :identity_id, :allow_bits, :deny_bits]
    end

    read :list_for_channel do
      description "All overrides on the given channel."
      argument :channel_id, :uuid, allow_nil?: false
      filter expr(channel_id == ^arg(:channel_id))
    end
  end

  validations do
    validate fn changeset, _context ->
      role_id = Ash.Changeset.get_attribute(changeset, :role_id)
      identity_id = Ash.Changeset.get_attribute(changeset, :identity_id)

      cond do
        is_nil(role_id) and is_nil(identity_id) ->
          {:error, field: :role_id, message: "must target a role or an identity"}

        not is_nil(role_id) and not is_nil(identity_id) ->
          {:error, field: :role_id, message: "cannot target both a role and an identity"}

        true ->
          :ok
      end
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :allow_bits, :integer do
      allow_nil? false
      default 0
      public? true
    end

    attribute :deny_bits, :integer do
      allow_nil? false
      default 0
      public? true
    end

    create_timestamp :inserted_at
  end

  relationships do
    belongs_to :channel, Yawp.Servers.Channel do
      allow_nil? false
      attribute_writable? true
    end

    belongs_to :role, Yawp.Servers.Role do
      allow_nil? true
      attribute_writable? true
    end

    belongs_to :identity, Yawp.Identity.Identity do
      allow_nil? true
      attribute_writable? true
    end
  end

  @type t :: %__MODULE__{}
end
