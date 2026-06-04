defmodule Yawp.Identity.AddAnchorRpcTest do
  @moduledoc false
  use Yawp.DataCase, async: false

  import Yawp.TestSupport.PubKey
  use Oban.Testing, repo: Yawp.Repo

  alias Yawp.Federation.AnchorAdoptionWorker
  alias Yawp.Identity

  @home_host "anchor-a.example"
  @new_anchor "localhost:14100"

  defp seed_identity!(opts \\ []) do
    {pk, priv} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)

    anchor_list = Keyword.get(opts, :anchor_list, [@home_host])
    profile_version = Keyword.get(opts, :profile_version, 1)

    identity =
      Ash.Seed.seed!(Yawp.Identity.Identity, %{
        did: did,
        master_public_key: pk,
        anchor_list: anchor_list,
        profile_version: profile_version
      })

    if Keyword.get(opts, :seed_ppe?, true) do
      {:ok, :applied} =
        Identity.apply_ppe_if_newer(%{
          "did" => did,
          "public_key" => pubkey_b64(pk),
          "profile_version" => profile_version,
          "anchors" => anchor_list,
          "display_name" => "Alice"
        })
    end

    %{identity: identity, pk: pk, priv: priv, did: did}
  end

  defp sign_ppe(payload, priv) do
    canonical = Yawp.CanonicalJson.encode(Map.delete(payload, "signature"))
    sig = :crypto.sign(:eddsa, :none, canonical, [priv, :ed25519])
    Map.put(payload, "signature", Base.url_encode64(sig, padding: false))
  end

  defp build_signed_ppe(%{did: did, pk: pk, priv: priv}, anchors, version, attrs \\ %{}) do
    %{
      "did" => did,
      "public_key" => pubkey_b64(pk),
      "profile_version" => version,
      "anchors" => anchors,
      "display_name" => "Alice"
    }
    |> Map.merge(attrs)
    |> sign_ppe(priv)
  end

  defp run(actor, did, new_anchor, signed_ppe) do
    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Conn.assign(:current_identity, actor)
      |> Ash.PlugHelpers.set_actor(actor)

    input = %{"newAnchor" => new_anchor}
    input = if signed_ppe, do: Map.put(input, "signedPpe", signed_ppe), else: input

    AshTypescript.Rpc.run_action(:yawp, conn, %{
      "action" => "add_anchor",
      "identity" => %{"did" => did},
      "fields" => ["id", "did", "anchorList", "profileVersion"],
      "input" => input
    })
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  describe "add_anchor (success)" do
    test "appends the new anchor, bumps profile_version, caches the re-signed PPE, enqueues adoption" do
      ctx = seed_identity!(profile_version: 1, anchor_list: [@home_host])

      signed_ppe = build_signed_ppe(ctx, [@home_host, @new_anchor], 2)
      result = run(ctx.identity, ctx.did, @new_anchor, signed_ppe)
      assert success?(result), inspect(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, ctx.identity.id, authorize?: false)
      assert @new_anchor in reloaded.anchor_list
      assert reloaded.profile_version == 2

      {:ok, ppe} = Identity.get_ppe_by_did(ctx.did)
      assert @new_anchor in ppe.envelope["anchors"]
      assert ppe.profile_version == 2

      assert_enqueued(
        worker: AnchorAdoptionWorker,
        args: %{"did" => ctx.did, "new_anchor" => @new_anchor}
      )
    end

    test "adding an anchor already present is a no-op (no duplicate, no bump)" do
      ctx =
        seed_identity!(anchor_list: [@home_host, @new_anchor], profile_version: 4)

      result = run(ctx.identity, ctx.did, @new_anchor, nil)
      assert success?(result), inspect(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, ctx.identity.id, authorize?: false)
      assert Enum.count(reloaded.anchor_list, &(&1 == @new_anchor)) == 1
      assert reloaded.profile_version == 4
    end
  end

  describe "add_anchor (PPE integrity)" do
    test "rejects an add when the signed PPE omits the new anchor" do
      ctx = seed_identity!(profile_version: 1, anchor_list: [@home_host])

      bad_ppe = build_signed_ppe(ctx, [@home_host], 2)
      result = run(ctx.identity, ctx.did, @new_anchor, bad_ppe)

      assert success?(result) == false
      assert "invalid_ppe" in error_types(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, ctx.identity.id, authorize?: false)
      refute @new_anchor in reloaded.anchor_list
    end

    test "rejects an add when the PPE signature does not verify" do
      ctx = seed_identity!(profile_version: 1, anchor_list: [@home_host])

      forged =
        ctx
        |> build_signed_ppe([@home_host, @new_anchor], 2)
        |> Map.put("display_name", "Mallory")

      result = run(ctx.identity, ctx.did, @new_anchor, forged)

      assert success?(result) == false
      assert "invalid_ppe" in error_types(result)

      {:ok, ppe} = Identity.get_ppe_by_did(ctx.did)
      refute @new_anchor in ppe.envelope["anchors"]
    end

    test "rejects an add with a missing signed PPE on the append path" do
      ctx = seed_identity!(profile_version: 1, anchor_list: [@home_host])

      result = run(ctx.identity, ctx.did, @new_anchor, nil)

      assert success?(result) == false
      assert "invalid_ppe" in error_types(result)
    end
  end

  describe "add_anchor (authorization)" do
    test "unauthenticated call returns unauthorized" do
      ctx = seed_identity!()
      signed_ppe = build_signed_ppe(ctx, [@home_host, @new_anchor], 2)

      result =
        AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
          "action" => "add_anchor",
          "identity" => %{"did" => ctx.did},
          "fields" => ["id", "did"],
          "input" => %{"newAnchor" => @new_anchor, "signedPpe" => signed_ppe}
        })

      assert success?(result) == false
      assert "unauthorized" in error_types(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, ctx.identity.id, authorize?: false)
      refute @new_anchor in reloaded.anchor_list
    end

    test "a different identity cannot add an anchor to someone else" do
      alice = seed_identity!()
      bob = seed_identity!()
      signed_ppe = build_signed_ppe(alice, [@home_host, @new_anchor], 2)

      result = run(bob.identity, alice.did, @new_anchor, signed_ppe)

      assert success?(result) == false
      assert "unauthorized" in error_types(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, alice.identity.id, authorize?: false)
      refute @new_anchor in reloaded.anchor_list
    end
  end
end
