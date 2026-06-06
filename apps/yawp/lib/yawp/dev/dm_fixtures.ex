defmodule Yawp.Dev.DmFixtures do
  @moduledoc false

  alias Yawp.Admin
  alias Yawp.Identity
  alias Yawp.Servers
  alias Yawp.Servers.ServerInvite

  @cast [:alice, :bob, :carol, :dave]
  @display_names %{alice: "Alice", bob: "Bob", carol: "Carol", dave: "Dave"}
  @enabled Mix.env() != :prod

  def provision(opts) when is_map(opts) do
    if @enabled do
      do_provision(opts)
    else
      {:error, :dev_only}
    end
  end

  defp do_provision(opts) do
    anchor = Map.fetch!(opts, :anchor)
    anchor_url = Map.fetch!(opts, :anchor_url)
    peer_anchor_url = Map.fetch!(opts, :peer_anchor_url)
    output_dir = Map.get(opts, :output_dir, default_output_dir())

    :ok = Servers.Seeder.run()
    :ok = Yawp.Federation.ensure_active_server_key!()

    users = Map.new(@cast, &{&1, fixture_user(&1)})
    local_names = local_names(anchor)
    owner_name = owner_name(anchor)

    with {:ok, _local_primary} <- ensure_owner(Map.fetch!(users, owner_name)),
         {:ok, mint_actor} <- Identity.get_chat_owner(),
         {:ok, _members} <- ensure_members(local_names -- [owner_name], users, mint_actor),
         :ok <- publish_profiles(users, anchor_url, peer_anchor_url),
         :ok <- accept_standard_peers(anchor, users),
         {:ok, artifact} <- write_artifact(anchor, users, anchor_url, peer_anchor_url, output_dir) do
      {:ok, artifact}
    end
  end

  defp ensure_owner(user) do
    case Identity.get_identity_by_did(user.did) do
      {:ok, %Identity.Identity{} = identity} ->
        bind_user(identity, user)

      _ ->
        if Servers.SetupState.claimed?() do
          invite_user(user)
        else
          claim_user(user)
        end
    end
  end

  defp claim_user(user) do
    with {:ok, account} <- ensure_fixture_account(),
         {:ok, token} <- Admin.generate_claim_token(%{created_by_account_id: account.id}),
         args <- claim_args(token.token, user),
         {:ok, identity} <- Identity.claim_chat_owner(args, authorize?: false),
         {:ok, bound} <- bind_user(identity, user) do
      {:ok, bound}
    end
  end

  defp invite_user(user) do
    with {:ok, owner} <- Identity.get_chat_owner(),
         {:ok, server} <- Servers.get_singleton_server() do
      redeem_member(user, owner, server)
    end
  end

  defp ensure_members(names, users, owner) do
    {:ok, server} = Servers.get_singleton_server()

    Enum.reduce_while(names, {:ok, []}, fn name, {:ok, acc} ->
      user = Map.fetch!(users, name)

      result =
        case Identity.get_identity_by_did(user.did) do
          {:ok, %Identity.Identity{} = identity} ->
            bind_user(identity, user)

          _ ->
            redeem_member(user, owner, server)
        end

      case result do
        {:ok, identity} -> {:cont, {:ok, [identity | acc]}}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp redeem_member(user, owner, server) do
    with {:ok, invite} <-
           Servers.mint_server_invite(
             %{server_id: server.id, kind: :multi_use, uses_remaining: 10},
             actor: owner
           ),
         args <- redeem_args(invite.token, user),
         {:ok, _} <-
           ServerInvite
           |> Ash.ActionInput.for_action(:redeem, args)
           |> Ash.run_action(authorize?: false),
         {:ok, identity} <- Identity.get_identity_by_did(user.did),
         {:ok, bound} <- bind_user(identity, user) do
      {:ok, bound}
    end
  end

  defp bind_user(identity, user) do
    if Enum.any?(identity.device_subkeys["subkeys"] || [], &(&1["device_id"] == user.device_id)) do
      {:ok, identity}
    else
      Identity.bind_device(identity, bind_args(user))
    end
  end

  defp publish_profiles(users, anchor_url, peer_anchor_url) do
    a_host = host(anchor_url)
    b_host = host(peer_anchor_url)

    Enum.reduce_while(users, :ok, fn {name, user}, :ok ->
      anchors = if name == :alice, do: [a_host], else: [b_host]

      case Identity.apply_ppe_if_newer(signed_ppe(user, anchors)) do
        {:ok, _} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp accept_standard_peers(:a, users) do
    alice = Map.fetch!(users, :alice)
    accept_peers(alice.did, [users.bob.did, users.carol.did])
  end

  defp accept_standard_peers(:b, users) do
    with :ok <- accept_peers(users.bob.did, [users.alice.did]),
         :ok <- accept_peers(users.carol.did, [users.alice.did]) do
      :ok
    end
  end

  defp accept_peers(did, peer_dids) do
    with {:ok, identity} <- Identity.get_identity_by_did(did) do
      Enum.reduce_while(peer_dids, :ok, fn peer_did, :ok ->
        case Identity.accept_peer_request(identity, %{peer_did: peer_did},
               actor: identity,
               authorize?: false
             ) do
          {:ok, _} -> {:cont, :ok}
          {:error, reason} -> {:halt, {:error, reason}}
        end
      end)
    end
  end

  defp write_artifact(anchor, users, anchor_url, peer_anchor_url, output_dir) do
    File.mkdir_p!(output_dir)
    anchor_urls = fixture_anchor_urls(anchor, anchor_url, peer_anchor_url)

    artifact = %{
      "anchors" => %{"a" => anchor_urls.a, "b" => anchor_urls.b},
      "indexedDb" => %{
        "database" => "yawp.identity",
        "store" => "yawp.identity",
        "key" => "v1"
      },
      "identities" =>
        Map.new(users, fn {name, user} ->
          {Atom.to_string(name), browser_identity(user, anchor_urls.a, anchor_urls.b)}
        end)
    }

    path = Path.join(output_dir, "dm_cast.json")
    File.write!(path, Jason.encode!(artifact, pretty: true))
    {:ok, Map.put(artifact, "path", path)}
  end

  defp browser_identity(user, anchor_url, peer_anchor_url) do
    server_url = if user.name == :alice, do: anchor_url, else: peer_anchor_url
    peers = if user.name == :alice, do: [:bob, :carol], else: [:alice]

    %{
      "did" => user.did,
      "serverUrl" => server_url,
      "bundle" => bundle(user, server_url, peers)
    }
  end

  defp bundle(user, server_url, peer_names) do
    %{
      "version" => 1,
      "master" => %{"sk" => b64(user.master_sk)},
      "device" => %{
        "deviceId" => user.device_id,
        "sk" => b64(user.device_sk),
        "pk" => b64(user.device_pk),
        "signature" => user.device_signature,
        "issuedAt" => user.issued_at
      },
      "metadata" => %{
        "displayNameOverride" => Map.fetch!(@display_names, user.name),
        "servers" => [
          %{"url" => server_url, "did" => user.did, "role" => role(user.name), "label" => "Yawp"}
        ],
        "firstBoundAt" => user.issued_at,
        "profileVersion" => 1,
        "publishedProfile" => %{
          "display_name" => Map.fetch!(@display_names, user.name),
          "anchors" => [host(server_url)]
        },
        "acceptedPeers" => Enum.map(peer_names, &fixture_user(&1).did),
        "readReceiptsEnabled" => true
      }
    }
  end

  defp signed_ppe(user, anchors) do
    %{
      "did" => user.did,
      ("public_" <> "key") => b64(user.master_pk),
      "profile_version" => 1,
      "anchors" => anchors,
      "display_name" => Map.fetch!(@display_names, user.name),
      "device_subkeys" => [
        %{
          "device_id" => user.device_id,
          "pk" => b64(user.device_pk),
          "issued_at" => user.issued_at,
          "signature" => user.device_signature
        }
      ]
    }
    |> sign_inner("signature", user.master_sk)
  end

  defp claim_args(token, user) do
    pk = b64(user.master_pk)

    canonical =
      Yawp.CanonicalJson.encode(%{"claim_token" => token, "did" => user.did, "pk" => pk})

    signature = :crypto.sign(:eddsa, :none, canonical, [user.master_sk, :ed25519])
    %{claim_token: token, did: user.did, pk: pk, sender_signature: b64(signature)}
  end

  defp redeem_args(token, user) do
    pk = b64(user.master_pk)
    canonical = Yawp.CanonicalJson.encode(%{"token" => token, "did" => user.did, "pk" => pk})
    signature = :crypto.sign(:eddsa, :none, canonical, [user.master_sk, :ed25519])
    %{token: token, did: user.did, pk: pk, sender_signature: b64(signature)}
  end

  defp bind_args(user) do
    device_pk = b64(user.device_pk)

    canonical =
      Yawp.CanonicalJson.encode(%{
        "did" => user.did,
        "device_id" => user.device_id,
        "device_pk" => device_pk,
        "device_signature" => user.device_signature,
        "device_issued_at" => user.issued_at,
        "request_issued_at" => user.request_issued_at
      })

    sender_signature = :crypto.sign(:eddsa, :none, canonical, [user.device_sk, :ed25519])

    %{
      device_id: user.device_id,
      device_pk: device_pk,
      device_signature: user.device_signature,
      sender_signature: b64(sender_signature),
      device_issued_at: user.issued_at,
      request_issued_at: user.request_issued_at
    }
  end

  defp fixture_user(name) do
    master_sk = seed(name, "master")
    device_sk = seed(name, "device")
    {master_pk, ^master_sk} = :crypto.generate_key(:eddsa, :ed25519, master_sk)
    {device_pk, ^device_sk} = :crypto.generate_key(:eddsa, :ed25519, device_sk)
    issued_at = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()
    device_id = deterministic_uuid(name)
    device_signature = sign_device(master_sk, device_id, device_pk, issued_at)

    %{
      name: name,
      did: "did:yawp:" <> Identity.did_from_pubkey(master_pk),
      master_pk: master_pk,
      master_sk: master_sk,
      device_pk: device_pk,
      device_sk: device_sk,
      device_id: device_id,
      device_signature: device_signature,
      issued_at: issued_at,
      request_issued_at: issued_at
    }
  end

  defp sign_device(master_sk, device_id, device_pk, issued_at) do
    %{"device_id" => device_id, "pk" => b64(device_pk), "issued_at" => issued_at}
    |> Yawp.CanonicalJson.encode()
    |> then(&:crypto.sign(:eddsa, :none, &1, [master_sk, :ed25519]))
    |> b64()
  end

  defp sign_inner(payload, signature_field, sk) do
    signature =
      payload
      |> Yawp.CanonicalJson.encode()
      |> then(&:crypto.sign(:eddsa, :none, &1, [sk, :ed25519]))
      |> b64()

    Map.put(payload, signature_field, signature)
  end

  defp ensure_fixture_account do
    email = "dm-fixtures@example.invalid"

    case Admin.get_admin_account_by_email(email) do
      {:ok, %Admin.Account{} = account} ->
        {:ok, account}

      _ ->
        password =
          24
          |> :crypto.strong_rand_bytes()
          |> Base.encode16(case: :lower)

        Admin.create_account(
          %{
            email: email,
            password: password,
            password_confirmation: password
          },
          authorize?: false
        )
    end
  end

  defp seed(name, kind), do: :crypto.hash(:sha256, "yawp:dm-fixtures:#{name}:#{kind}")

  defp deterministic_uuid(name) do
    <<a::32, b::16, c::16, d::16, e::48, _::binary>> = seed(name, "device-id")
    c = Bitwise.bor(Bitwise.band(c, 0x0FFF), 0x4000)
    d = Bitwise.bor(Bitwise.band(d, 0x3FFF), 0x8000)

    [<<a::32>>, <<b::16>>, <<c::16>>, <<d::16>>, <<e::48>>]
    |> Enum.map(&Base.encode16(&1, case: :lower))
    |> Enum.join("-")
  end

  defp role(:alice), do: "Owner"
  defp role(:bob), do: "Owner"
  defp role(_), do: "Member"

  defp owner_name(:a), do: :alice
  defp owner_name(:b), do: :bob

  defp local_names(:a), do: [:alice]
  defp local_names(:b), do: [:bob, :carol, :dave]

  defp fixture_anchor_urls(:a, anchor_url, peer_anchor_url),
    do: %{a: anchor_url, b: peer_anchor_url}

  defp fixture_anchor_urls(:b, anchor_url, peer_anchor_url),
    do: %{a: peer_anchor_url, b: anchor_url}

  defp host(url), do: URI.parse(url).authority || url

  defp b64(bytes), do: Base.url_encode64(bytes, padding: false)

  def default_output_dir do
    Path.expand("../../../../../.cache/dm-fixtures", __DIR__)
  end
end
