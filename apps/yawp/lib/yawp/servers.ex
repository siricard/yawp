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

  use Ash.Domain, otp_app: :yawp

  resources do
    resource Yawp.Servers.Server do
      define :create_server, action: :create, args: [:name]
      define :list_servers, action: :read
    end

    resource Yawp.Servers.Role do
      define :create_role, action: :create
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

  @doc """
  Returns the roles on the given server.
  """
  @spec list_roles_for_server(Ecto.UUID.t()) :: [Yawp.Servers.Role.t()]
  def list_roles_for_server(server_id) do
    require Ash.Query

    Yawp.Servers.Role
    |> Ash.Query.filter(server_id == ^server_id)
    |> Ash.read!()
  end

  @doc """
  Returns the system role with the given name on the given server, or `nil`.

   uses this to grab the Owner Role row when assigning it to the
  operator account.
  """
  @spec get_system_role_for_server(String.t(), Ecto.UUID.t()) ::
          Yawp.Servers.Role.t() | nil
  def get_system_role_for_server(name, server_id) do
    require Ash.Query

    Yawp.Servers.Role
    |> Ash.Query.filter(server_id == ^server_id and name == ^name and system == true)
    |> Ash.read_one!()
  end
end
