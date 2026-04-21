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
    end
  end

  resources do
    resource Yawp.Servers.Server do
      define :create_server, action: :create, args: [:name]
      define :list_servers, action: :read
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
    end

    resource Yawp.Servers.Membership do
      define :assign_role,
        action: :create,
        args: [:identity_id, :server_id, :role_id]
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
