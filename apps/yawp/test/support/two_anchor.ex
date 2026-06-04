defmodule Yawp.TestSupport.TwoAnchor do
  @moduledoc false

  @type anchor :: %{
          peer: pid(),
          node: node(),
          port: non_neg_integer(),
          host: String.t(),
          base_url: String.t(),
          database: String.t(),
          key_id: String.t()
        }

  @migration_timeout 120_000
  @boot_timeout 120_000

  @spec start_pair!(keyword()) :: %{a: anchor(), b: anchor()}
  def start_pair!(_opts \\ []) do
    a = start_anchor!("a")
    ExUnit.Callbacks.on_exit(fn -> stop_anchor(a) end)

    b = start_anchor!("b")
    ExUnit.Callbacks.on_exit(fn -> stop_anchor(b) end)

    %{a: a, b: b}
  end

  @spec start_one!(String.t()) :: anchor()
  def start_one!(label \\ "a") do
    anchor = start_anchor!(label)
    ExUnit.Callbacks.on_exit(fn -> stop_anchor(anchor) end)
    anchor
  end

  @spec host(anchor()) :: String.t()
  def host(%{host: host}), do: host

  @spec base_url(anchor()) :: String.t()
  def base_url(%{base_url: base_url}), do: base_url

  @spec call(anchor(), module(), atom(), [term()]) :: term()
  def call(%{peer: peer}, mod, fun, args) do
    :peer.call(peer, mod, fun, args, @boot_timeout)
  end

  @spec sign_on(anchor(), map()) :: String.t()
  def sign_on(%{peer: peer, host: host}, inner) when is_map(inner) do
    :peer.call(
      peer,
      Yawp.Federation.Wrapper,
      :encode_body,
      [inner, [sender_anchor_id: host]],
      @boot_timeout
    )
  end

  @spec post(anchor(), String.t(), String.t()) :: {:ok, Req.Response.t()} | {:error, term()}
  def post(%{base_url: base_url}, path, body) when is_binary(path) and is_binary(body) do
    Req.post(
      url: base_url <> path,
      body: body,
      headers: [{"content-type", "application/json"}],
      retry: false
    )
  end

  @spec signing_fn(anchor()) :: (map() -> {binary(), String.t()})
  def signing_fn(%{peer: peer}) do
    fn payload ->
      {:ok, signature, key_id} =
        :peer.call(peer, Yawp.Federation, :sign, [payload], @boot_timeout)

      {signature, key_id}
    end
  end

  defp start_anchor!(label) do
    suffix = "#{label}_#{System.unique_integer([:positive])}"
    database = "yawp_two_anchor_#{suffix}"
    port = free_port()
    host = "localhost:#{port}"
    base_url = "http://#{host}"

    migrate_database!(database)

    {:ok, peer, node} =
      :peer.start_link(%{name: :peer.random_name(), connection: :standard_io})

    :ok = :peer.call(peer, :code, :add_pathsa, [:code.get_path()])

    overlay_env!(peer, database, port)

    {:ok, _} = :peer.call(peer, Application, :ensure_all_started, [:yawp], @boot_timeout)
    :ok = :peer.call(peer, Yawp.Federation, :ensure_active_server_key!, [], @boot_timeout)

    {:ok, key} = :peer.call(peer, Yawp.Federation, :get_active_server_key, [], @boot_timeout)

    %{
      peer: peer,
      node: node,
      port: port,
      host: host,
      base_url: base_url,
      database: database,
      key_id: key.key_id
    }
  end

  defp overlay_env!(peer, database, port) do
    for {app, _, _} <- Application.loaded_applications() do
      _ = :peer.call(peer, Application, :load, [app])

      for {key, value} <- Application.get_all_env(app) do
        put_env!(peer, app, key, value)
      end
    end

    repo_env =
      Application.get_env(:yawp, Yawp.Repo)
      |> Keyword.delete(:pool)
      |> Keyword.put(:database, database)
      |> Keyword.put(:pool_size, 4)

    put_env!(peer, :yawp, Yawp.Repo, repo_env)

    endpoint_env =
      Application.get_env(:yawp, YawpWeb.Endpoint)
      |> Keyword.put(:http, ip: {127, 0, 0, 1}, port: port)
      |> Keyword.put(:server, true)
      |> Keyword.put(:url, host: "localhost", port: port)

    put_env!(peer, :yawp, YawpWeb.Endpoint, endpoint_env)
    put_env!(peer, :yawp, :ensure_server_key_on_boot, false)
    put_env!(peer, :yawp, :run_servers_seeder_on_boot, false)
    put_env!(peer, :yawp, :announce_setup_token_on_boot, false)
    put_env!(peer, :yawp, Yawp.Federation.KeyDocFetcher, [])
    put_env!(peer, :swoosh, :api_client, false)
    :ok
  end

  defp put_env!(peer, app, key, value) do
    :ok = :peer.call(peer, Application, :put_env, [app, key, value, [persistent: true]])
  end

  defp migrate_database!(database) do
    config =
      Application.get_env(:yawp, Yawp.Repo)
      |> Keyword.delete(:pool)
      |> Keyword.put(:database, database)
      |> Keyword.put(:pool_size, 2)
      |> Keyword.put(:name, nil)

    _ = Ecto.Adapters.Postgres.storage_down(config)
    :ok = Ecto.Adapters.Postgres.storage_up(config)

    {:ok, pid} = Yawp.Repo.start_link(config)
    previous = Yawp.Repo.get_dynamic_repo()
    Yawp.Repo.put_dynamic_repo(pid)

    try do
      path = Application.app_dir(:yawp, "priv/repo/migrations")
      Ecto.Migrator.run(Yawp.Repo, path, :up, all: true, timeout: @migration_timeout)
    after
      Yawp.Repo.put_dynamic_repo(previous)
      Supervisor.stop(pid)
    end

    :ok
  end

  defp stop_anchor(%{peer: peer, database: database}) do
    _ = safe_peer_stop(peer)
    drop_database(database)
    :ok
  end

  defp safe_peer_stop(peer) do
    :peer.stop(peer)
  catch
    _, _ -> :ok
  end

  defp drop_database(database) do
    config =
      Application.get_env(:yawp, Yawp.Repo)
      |> Keyword.delete(:pool)
      |> Keyword.put(:database, database)
      |> Keyword.put(:name, nil)

    _ = Ecto.Adapters.Postgres.storage_down(config)
    :ok
  rescue
    _ -> :ok
  end

  defp free_port do
    {:ok, socket} = :gen_tcp.listen(0, [:binary, ip: {127, 0, 0, 1}])
    {:ok, port} = :inet.port(socket)
    :gen_tcp.close(socket)
    port
  end
end
