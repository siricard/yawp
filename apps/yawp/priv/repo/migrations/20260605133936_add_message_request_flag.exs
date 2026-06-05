defmodule Yawp.Repo.Migrations.AddMessageRequestFlag do
  use Ecto.Migration

  def up do
    alter table(:federation_inbox_entries) do
      add :is_request, :boolean, null: false, default: false
    end
  end

  def down do
    alter table(:federation_inbox_entries) do
      remove :is_request
    end
  end
end
