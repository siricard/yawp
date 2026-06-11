defmodule Yawp.Servers do
  @moduledoc """
  Ash domain for the server / channel / role graph.

   lands the minimal schemas for `Server`, `Role`, and `Channel`
  plus a `Seeder` module that idempotently creates the singleton
  server row, its three system roles (Owner/Admin/Member), and the
  default `#general` text and `General` voice channels on first boot.
  Richer columns and the membership / invite / category tables land
  .
  """

  use Ash.Domain, otp_app: :yawp, extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Yawp.Servers.Channel do
      rpc_action :list_text_channels, :list_text_channels
      rpc_action :create_channel, :create
      rpc_action :recategorize_channel, :recategorize
      rpc_action :reorder_channels, :reorder
      rpc_action :destroy_channel, :destroy
    end

    resource Yawp.Servers.Category do
      rpc_action :create_category, :create
      rpc_action :reorder_categories, :reorder
      rpc_action :list_categories_for_server, :list_for_server
    end

    resource Yawp.Servers.ServerInvite do
      rpc_action :redeem_server_invite, :redeem
    end

    resource Yawp.Servers.RoomInvite do
      rpc_action :create_room_invite, :create_invite
      rpc_action :redeem_room_invite, :redeem
    end

    resource Yawp.Servers.Kick do
      rpc_action :kick_member, :kick
    end

    resource Yawp.Servers.Ban do
      rpc_action :ban_member, :ban
    end
  end

  resources do
    resource Yawp.Servers.Server do
      define :create_server, action: :create, args: [:name]
      define :list_servers, action: :read
      define :set_server_owner, action: :set_owner, args: [:owner_did]
    end

    resource Yawp.Servers.Role do
      define :create_role, action: :create
      define :list_roles_for_server, action: :list_for_server, args: [:server_id]

      define :get_system_role_for_server,
        action: :get_system_role,
        args: [:name, :server_id],
        not_found_error?: false
    end

    resource Yawp.Servers.Channel do
      define :create_channel, action: :create
      define :recategorize_channel, action: :recategorize
      define :reorder_channels, action: :reorder
      define :destroy_channel, action: :destroy
    end

    resource Yawp.Servers.Category do
      define :create_category, action: :create
      define :reorder_categories, action: :reorder
      define :list_categories_for_server, action: :list_for_server, args: [:server_id]
    end

    resource Yawp.Servers.Membership do
      define :assign_role,
        action: :create,
        args: [:identity_id, :server_id, :role_ids]

      define :set_membership_roles, action: :set_roles, args: [:role_ids]
      define :set_membership_moderation, action: :set_moderation
    end

    resource Yawp.Servers.ChannelOverride do
      define :create_channel_override, action: :create
      define :list_channel_overrides, action: :list_for_channel, args: [:channel_id]
    end

    resource Yawp.Servers.ServerInvite do
      define :mint_server_invite, action: :mint
      define :revoke_server_invite, action: :revoke
      define :get_server_invite_by_id, action: :get_by_id, args: [:id]

      define :get_server_invite_by_token,
        action: :get_by_token,
        args: [:token],
        not_found_error?: false

      define :list_active_server_invites, action: :list_active_for_server, args: [:server_id]
    end

    resource Yawp.Servers.RoomInvite do
      define :create_room_invite, action: :create_invite
      define :revoke_room_invite, action: :revoke
      define :get_room_invite_by_id, action: :get_by_id, args: [:id]

      define :get_room_invite_by_token,
        action: :get_by_token,
        args: [:token],
        not_found_error?: false

      define :list_active_room_invites, action: :list_active_for_channel, args: [:channel_id]
    end

    resource Yawp.Servers.Kick do
      define :kick_member, action: :kick
      define :list_kicks_for_server, action: :list_for_server, args: [:server_id]
    end

    resource Yawp.Servers.Ban do
      define :ban_member, action: :ban
      define :list_bans_for_server, action: :list_for_server, args: [:server_id]
    end

    resource Yawp.Servers.Message do
      define :send_server_message, action: :send
      define :list_channel_messages, action: :list_for_channel, args: [:channel_id]
    end

    resource Yawp.Servers.ReadMarker do
      define :upsert_read_marker, action: :upsert

      define :get_read_marker,
        action: :get_for_identity_channel,
        args: [:identity_id, :channel_id],
        not_found_error?: false
    end

    resource Yawp.Servers.MessageEdit do
      define :edit_server_message, action: :append
      define :list_message_edits, action: :list_for_message, args: [:message_id]
    end

    resource Yawp.Servers.MessageTombstone do
      define :delete_server_message, action: :create
      define :list_message_tombstones, action: :list_for_message, args: [:message_id]
    end

    resource Yawp.Servers.ArchivedMessageBody do
      define :list_archived_bodies_for_message, action: :list_for_message, args: [:message_id]
    end

    resource Yawp.Servers.Attachment do
      define :record_attachment_upload, action: :record_upload
      define :get_attachment_by_upload_id, action: :get_by_upload_id, args: [:upload_id]
    end
  end

  @doc """
  Returns `{:ok, server | nil}` for the singleton server.

   uses this to look up the Server FK when assigning the Owner
  role to the operator account.
  """
  @spec get_singleton_server() :: {:ok, Yawp.Servers.Server.t() | nil}
  def get_singleton_server do
    case list_servers() do
      {:ok, [server | _]} -> {:ok, server}
      {:ok, []} -> {:ok, nil}
    end
  end
end
