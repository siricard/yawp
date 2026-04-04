defmodule YawpWeb.ClaimControllerConcurrencyTest do
  @moduledoc """
  concurrent POST /api/claim with the same valid token
  must produce AT MOST one chat-owner Identity and one Owner-role
  Membership. The DID-derivation check + Identity upsert + role
  assignment + token-consume must be atomic.
  """
  use YawpWeb.ConnCase, async: false

  alias Yawp.Admin

  @password "correct horse battery staple"

  defp create_account!(email) do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  defp issue_token!(account) do
    {:ok, claim} = Admin.generate_claim_token(%{created_by_account_id: account.id})
    claim
  end

  defp build_claim_body(token) do
    {pk, sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Yawp.Identity.did_from_pubkey(pk)
    pk_b64 = Base.url_encode64(pk, padding: false)

    payload = %{"claim_token" => token, "did" => did, "pk" => pk_b64}
    canonical = Yawp.CanonicalJson.encode(payload)
    sig = :crypto.sign(:eddsa, :none, canonical, [sk, :ed25519])
    sig_b64 = Base.url_encode64(sig, padding: false)

    %{
      "claim_token" => token,
      "did" => did,
      "pk" => pk_b64,
      "sender_signature" => sig_b64
    }
  end

  setup do
    :ok = Yawp.Servers.Seeder.run()
    :ok
  end

  test "N concurrent valid POSTs with the same token create exactly one Identity + one Owner membership" do
    account = create_account!("op-concurrent@example.com")
    claim = issue_token!(account)
    n = 4

                bodies = for _ <- 1..n, do: build_claim_body(claim.token)

    parent = self()

    results =
      bodies
      |> Task.async_stream(
        fn body ->
                    Ecto.Adapters.SQL.Sandbox.allow(Yawp.Repo, parent, self())

          conn =
            Phoenix.ConnTest.build_conn()
            |> Phoenix.ConnTest.post("/api/claim", body)

          {conn.status, body["did"]}
        end,
        max_concurrency: n,
        timeout: :infinity,
        ordered: false
      )
      |> Enum.map(fn {:ok, r} -> r end)

    successes = Enum.filter(results, fn {status, _did} -> status == 200 end)
    failures = Enum.filter(results, fn {status, _did} -> status >= 400 end)

    assert length(successes) == 1,
           "expected exactly 1 successful claim, got #{length(successes)}; results=#{inspect(results)}"

    assert length(successes) + length(failures) == n,
           "expected all responses to be either 200 or 4xx; got #{inspect(results)}"

    {200, winning_did} = hd(successes)

        identities =
      Yawp.Identity.Identity
      |> Ash.Query.for_read(:read)
      |> Ash.read!(authorize?: false)

    assert length(identities) == 1
    assert hd(identities).did == winning_did

        {:ok, server} = Yawp.Servers.get_singleton_server()
    {:ok, owner_role} = Yawp.Servers.get_system_role_for_server("Owner", server.id)

    require Ash.Query

    memberships =
      Yawp.Servers.Membership
      |> Ash.Query.filter(server_id == ^server.id and role_id == ^owner_role.id)
      |> Ash.read!(authorize?: false)

    assert length(memberships) == 1
    assert hd(memberships).identity_id == hd(identities).id

        {:ok, refetched} = Admin.get_claim_token_by_id(claim.id)
    assert refetched.consumed_at != nil
  end
end
