defmodule Yawp.Identity.AddAnchorRpcTest do
  @moduledoc """
  `:add_anchor` RPC action on `Yawp.Identity.Identity`. An
  authenticated user adds a second anchor host to their identity: the
  host is appended to `anchor_list`, `profile_version` increments, and
  a background job is enqueued to adopt the new anchor and replicate to
  the existing ones. Only the identity itself (matching actor) may add
  an anchor.
  """
  use Yawp.DataCase, async: false
  use Oban.Testing, repo: Yawp.Repo

  alias Yawp.Federation.AnchorAdoptionWorker
  alias Yawp.Identity

  @new_anchor "localhost:14100"

  defp seed_identity!(opts \\ []) do
    {pk, _sk} = :crypto.generate_key(:eddsa, :ed25519)
    did = "did:yawp:" <> Identity.did_from_pubkey(pk)

    anchor_list = Keyword.get(opts, :anchor_list, [YawpWeb.Endpoint.url()])

    Ash.Seed.seed!(Yawp.Identity.Identity, %{
      did: did,
      master_public_key: pk,
      anchor_list: anchor_list,
      profile_version: Keyword.get(opts, :profile_version, 1)
    })
  end

  defp run(actor, did, new_anchor) do
    conn =
      Phoenix.ConnTest.build_conn()
      |> Plug.Conn.assign(:current_identity, actor)
      |> Ash.PlugHelpers.set_actor(actor)

    AshTypescript.Rpc.run_action(:yawp, conn, %{
      "action" => "add_anchor",
      "identity" => %{"did" => did},
      "fields" => ["id", "did", "anchorList", "profileVersion"],
      "input" => %{"newAnchor" => new_anchor}
    })
  end

  defp success?(result), do: Map.get(result, :success) || Map.get(result, "success")
  defp errors(result), do: Map.get(result, :errors) || Map.get(result, "errors") || []

  defp error_types(result) do
    Enum.map(errors(result), fn err -> Map.get(err, :type) || Map.get(err, "type") end)
  end

  describe "add_anchor (success)" do
    test "appends the new anchor, bumps profile_version, enqueues adoption" do
      identity = seed_identity!(profile_version: 1)

      result = run(identity, identity.did, @new_anchor)
      assert success?(result), inspect(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert @new_anchor in reloaded.anchor_list
      assert reloaded.profile_version == 2

      assert_enqueued(
        worker: AnchorAdoptionWorker,
        args: %{"did" => identity.did, "new_anchor" => @new_anchor}
      )
    end

    test "adding an anchor already present is a no-op (no duplicate, no bump)" do
      identity =
        seed_identity!(anchor_list: [YawpWeb.Endpoint.url(), @new_anchor], profile_version: 4)

      result = run(identity, identity.did, @new_anchor)
      assert success?(result), inspect(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      assert Enum.count(reloaded.anchor_list, &(&1 == @new_anchor)) == 1
      assert reloaded.profile_version == 4
    end
  end

  describe "add_anchor (authorization)" do
    test "unauthenticated call returns unauthorized" do
      identity = seed_identity!()

      result =
        AshTypescript.Rpc.run_action(:yawp, Phoenix.ConnTest.build_conn(), %{
          "action" => "add_anchor",
          "identity" => %{"did" => identity.did},
          "fields" => ["id", "did"],
          "input" => %{"newAnchor" => @new_anchor}
        })

      assert success?(result) == false
      assert "unauthorized" in error_types(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, identity.id, authorize?: false)
      refute @new_anchor in reloaded.anchor_list
    end

    test "a different identity cannot add an anchor to someone else" do
      alice = seed_identity!()
      bob = seed_identity!()

      result = run(bob, alice.did, @new_anchor)

      assert success?(result) == false
      assert "unauthorized" in error_types(result)

      {:ok, reloaded} = Ash.get(Yawp.Identity.Identity, alice.id, authorize?: false)
      refute @new_anchor in reloaded.anchor_list
    end
  end
end
