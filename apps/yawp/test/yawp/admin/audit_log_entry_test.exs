defmodule Yawp.Admin.AuditLogEntryTest do
  @moduledoc """
  `Yawp.Admin.AuditLogEntry` resource + `Yawp.Admin.audit!/3`
  helper. Validates the resource shape (id / account_id / action /
  payload / inserted_at), the helper inserts a row and tolerates a
  nil account_id (for login-failure entries), and that the
  newest-first read action `list_recent` returns entries in descending
  inserted_at order.
  """
  use Yawp.DataCase, async: false

  alias Yawp.Admin
  alias Yawp.Admin.AuditLogEntry

  @password "correct horse battery staple"

  defp create_account!(email \\ "op@example.com") do
    {:ok, account} =
      Admin.create_account(%{
        email: email,
        password: @password,
        password_confirmation: @password
      })

    account
  end

  describe "attributes" do
    test "exposes id, account_id, action, payload, inserted_at" do
      attrs = Ash.Resource.Info.attributes(AuditLogEntry) |> Enum.map(& &1.name)
      assert :id in attrs
      assert :account_id in attrs
      assert :action in attrs
      assert :payload in attrs
      assert :inserted_at in attrs
    end
  end

  describe "Yawp.Admin.audit!/3" do
    test "inserts a row with the given account_id, action, payload" do
      account = create_account!()
      entry = Admin.audit!(account.id, "login.success", %{ip: "127.0.0.1"})

      assert entry.account_id == account.id
      assert entry.action == "login.success"
      assert entry.payload == %{"ip" => "127.0.0.1"}
      assert %DateTime{} = entry.inserted_at
    end

    test "accepts nil account_id (login failure has no account)" do
      entry = Admin.audit!(nil, "login.failure", %{email: "nobody@example.com"})
      assert entry.account_id == nil
      assert entry.action == "login.failure"
      assert entry.payload == %{"email" => "nobody@example.com"}
    end

    test "defaults payload to an empty map if omitted via empty map" do
      account = create_account!()
      entry = Admin.audit!(account.id, "logout", %{})
      assert entry.payload == %{}
    end
  end

  describe "list_recent action" do
    test "returns newest entries first, capped at 50" do
      account = create_account!()

      for i <- 1..55 do
        Admin.audit!(account.id, "evt.#{i}", %{i: i})
      end

      {:ok, entries} = Admin.list_recent_audit_entries()
      assert length(entries) == 50

      timestamps = Enum.map(entries, & &1.inserted_at)
      assert timestamps == Enum.sort(timestamps, {:desc, DateTime})
    end
  end
end
