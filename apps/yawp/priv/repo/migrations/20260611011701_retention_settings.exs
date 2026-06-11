defmodule Yawp.Repo.Migrations.RetentionSettings do
  @moduledoc false

  use Ecto.Migration

  def up do
    alter table(:servers) do
      add :retention, :text, null: false, default: "forever"
      add :retention_duration_ms, :bigint
    end

    alter table(:server_channels) do
      add :retention, :text
      add :retention_duration_ms, :bigint
    end
  end

  def down do
    alter table(:server_channels) do
      remove :retention_duration_ms
      remove :retention
    end

    alter table(:servers) do
      remove :retention_duration_ms
      remove :retention
    end
  end
end
