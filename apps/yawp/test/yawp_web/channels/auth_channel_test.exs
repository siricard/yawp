defmodule YawpWeb.AuthChannelTest do
  use YawpWeb.ChannelCase, async: false

  require Ash.Query

  alias Yawp.Admin.Account, as: User
  alias Yawp.Identity

    @pubkey Base.decode16!(
            "03A107BFF3CE10BE1D70DD18E74BC09967E4D6309BA50D5F1DDC8664125531B8",
            case: :upper
          )
  @did "6ooAjytx2tERAi6rpXCqxMKCBr4z6Kw3UoRDbuuAUiGT"

      defmacrop join_lobby do
    quote do
      socket = socket(YawpWeb.UserSocket, nil, %{})

      {:ok, %{"nonce" => nonce_b64}, joined_socket} =
        subscribe_and_join(socket, YawpWeb.AuthChannel, "auth:lobby", %{})

      {joined_socket, Base.decode64!(nonce_b64)}
    end
  end

  defp register_user(pubkey) do
    User
    |> Ash.Changeset.for_create(:register_with_pubkey, %{public_key: pubkey}, authorize?: false)
    |> Ash.create!()
  end

  defp sign(nonce, sk_seed) do
            :crypto.sign(:eddsa, :sha512, nonce, [sk_seed, :ed25519])
  end

  describe "join/3" do
    test "issues a fresh 32-byte nonce in the join reply (base64)" do
      socket = socket(YawpWeb.UserSocket, nil, %{})

      {:ok, %{"nonce" => nonce_b64}, _socket} =
        subscribe_and_join(socket, YawpWeb.AuthChannel, "auth:lobby", %{})

      assert is_binary(nonce_b64)
      assert {:ok, raw} = Base.decode64(nonce_b64)
      assert byte_size(raw) == 32
    end

    test "successive joins return different nonces" do
      {_socket, n1} = join_lobby()
      {_socket, n2} = join_lobby()
      assert n1 != n2
    end
  end

  describe "handle_in authenticate — happy path" do
    setup do
            sk_seed =
        Base.decode16!(
          "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F",
          case: :upper
        )

      _user = register_user(@pubkey)
      {:ok, sk_seed: sk_seed}
    end

    test "valid signature returns {:ok, %{did: did}} and sets current_did", %{sk_seed: sk_seed} do
      {socket, nonce} = join_lobby()
      signature = sign(nonce, sk_seed)

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(signature)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :ok, %{did: returned_did}
      assert returned_did == @did

                  assert :sys.get_state(socket.channel_pid).assigns.current_did == @did
    end
  end

  describe "handle_in authenticate — negative paths" do
    setup do
      sk_seed =
        Base.decode16!(
          "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F",
          case: :upper
        )

      _user = register_user(@pubkey)
      {:ok, sk_seed: sk_seed}
    end

    test "tampered signature → {:error, :invalid_signature}", %{sk_seed: sk_seed} do
      {socket, nonce} = join_lobby()
      <<first, rest::binary>> = sign(nonce, sk_seed)
      tampered = <<Bitwise.bxor(first, 0x01)>> <> rest

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(tampered)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :error, %{reason: :invalid_signature}
    end

    test "replay of consumed nonce → {:error, :nonce_consumed}", %{sk_seed: sk_seed} do
      {socket, nonce} = join_lobby()
      signature = sign(nonce, sk_seed)

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(signature)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :ok, _

            ref2 = push(socket, "authenticate", payload)
      assert_reply ref2, :error, %{reason: :nonce_consumed}
    end

    test "did doesn't match base58(sha256(pubkey)) → {:error, :did_mismatch}",
         %{sk_seed: sk_seed} do
      {socket, nonce} = join_lobby()
      signature = sign(nonce, sk_seed)

      payload = %{
        "did" => "not-the-real-did",
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(signature)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :error, %{reason: :did_mismatch}
    end

    test "payload missing signature → {:error, :invalid_payload}" do
      {socket, _nonce} = join_lobby()

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :error, %{reason: :invalid_payload}
    end

    test "payload containing private_key → {:error, :forbidden_field}", %{sk_seed: sk_seed} do
      {socket, nonce} = join_lobby()
      signature = sign(nonce, sk_seed)

      payload = %{
        "did" => @did,
        "pk" => Base.encode64(@pubkey),
        "signature" => Base.encode64(signature),
        "private_key" => "leak"
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :error, %{reason: :forbidden_field}
    end
  end

  describe "concurrent first-time registration race" do
    test "4 parallel authenticates with the same fresh keypair all converge on the same User row" do
            sk_seed = :crypto.strong_rand_bytes(32)
      {pubkey, _} = :crypto.generate_key(:eddsa, :ed25519, sk_seed)
      did = Identity.did_from_pubkey(pubkey)

                                                joined_sockets =
        for _ <- 1..4 do
          s = socket(YawpWeb.UserSocket, nil, %{})

          {:ok, %{"nonce" => nonce_b64}, joined} =
            subscribe_and_join(s, YawpWeb.AuthChannel, "auth:lobby", %{})

          nonce = Base.decode64!(nonce_b64)
          signature = :crypto.sign(:eddsa, :sha512, nonce, [sk_seed, :ed25519])

          payload = %{
            "did" => did,
            "pk" => Base.encode64(pubkey),
            "signature" => Base.encode64(signature)
          }

          {joined, payload}
        end

                              refs =
        for {channel_socket, payload} <- joined_sockets do
          ref = push(channel_socket, "authenticate", payload)
          {ref, channel_socket}
        end

      results =
        Enum.map(refs, fn {ref, _socket} ->
          receive do
            %Phoenix.Socket.Reply{ref: ^ref, status: status, payload: payload} ->
              {status, payload}
          after
            5_000 -> {:timeout, nil}
          end
        end)

            assert Enum.all?(results, fn {status, _} -> status == :ok end),
             "expected all 4 authenticates to succeed; got: #{inspect(results)}"

            assert Enum.all?(results, fn {_, p} -> Map.get(p, :did) == did end)

            assert [user] =
               User
               |> Ash.Query.filter(public_key == ^pubkey)
               |> Ash.read!(authorize?: false)

      assert user.did == did
    end
  end

  describe "auto-registration of brand-new DIDs" do
    test "brand-new DID auto-registers and authenticates in the same join" do
            sk_seed = :crypto.strong_rand_bytes(32)
      {pubkey, _} = :crypto.generate_key(:eddsa, :ed25519, sk_seed)
      did = Identity.did_from_pubkey(pubkey)

            assert [] =
               User
               |> Ash.Query.filter(public_key == ^pubkey)
               |> Ash.read!(authorize?: false)

      {socket, nonce} = join_lobby()
      signature = :crypto.sign(:eddsa, :sha512, nonce, [sk_seed, :ed25519])

      payload = %{
        "did" => did,
        "pk" => Base.encode64(pubkey),
        "signature" => Base.encode64(signature)
      }

      ref = push(socket, "authenticate", payload)
      assert_reply ref, :ok, %{did: ^did}

            assert [user] =
               User
               |> Ash.Query.filter(public_key == ^pubkey)
               |> Ash.read!(authorize?: false)

      assert user.did == did
      assert user.public_key == pubkey
    end
  end
end
