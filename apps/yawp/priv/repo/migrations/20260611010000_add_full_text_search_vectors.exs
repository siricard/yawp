defmodule Yawp.Repo.Migrations.AddFullTextSearchVectors do
  use Ecto.Migration

  def up do
    alter table(:server_messages) do
      add :search_vector, :tsvector
    end

    alter table(:federation_inbox_entries) do
      add :search_vector, :tsvector
    end

    execute """
    create or replace function yawp_server_message_search_vector() returns trigger as $$
    begin
      new.search_vector :=
        setweight(to_tsvector('simple', coalesce(new.body, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(new.sender_did, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(new.channel_id::text, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(new.server_inserted_at::text, '')), 'D') ||
        setweight(to_tsvector('simple', coalesce(array_to_string(new.mentions, ' '), '')), 'A');
      return new;
    end
    $$ language plpgsql
    """

    execute """
    create or replace function yawp_inbox_entry_search_vector() returns trigger as $$
    begin
      new.search_vector :=
        setweight(to_tsvector('simple', coalesce(new.envelope->>'body', '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(new.recipient_did, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(new.conversation_id, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(new.received_at::text, '')), 'D') ||
        setweight(to_tsvector('simple', coalesce(new.envelope->>'mentions', '')), 'A');
      return new;
    end
    $$ language plpgsql
    """

    execute """
    create trigger server_messages_search_vector_trigger
    before insert or update of body, sender_did, channel_id, server_inserted_at, mentions
    on server_messages
    for each row execute function yawp_server_message_search_vector()
    """

    execute """
    create trigger federation_inbox_entries_search_vector_trigger
    before insert or update of envelope, recipient_did, conversation_id, received_at
    on federation_inbox_entries
    for each row execute function yawp_inbox_entry_search_vector()
    """

    execute "update server_messages set body = body"
    execute "update federation_inbox_entries set envelope = envelope"

    create index(:server_messages, [:search_vector],
             name: :server_messages_search_vector_gin_index,
             using: :gin
           )

    create index(:federation_inbox_entries, [:search_vector],
             name: :federation_inbox_entries_search_vector_gin_index,
             using: :gin
           )
  end

  def down do
    drop_if_exists index(:federation_inbox_entries, [:search_vector],
                     name: :federation_inbox_entries_search_vector_gin_index
                   )

    drop_if_exists index(:server_messages, [:search_vector],
                     name: :server_messages_search_vector_gin_index
                   )

    execute "drop trigger if exists federation_inbox_entries_search_vector_trigger on federation_inbox_entries"
    execute "drop trigger if exists server_messages_search_vector_trigger on server_messages"
    execute "drop function if exists yawp_inbox_entry_search_vector()"
    execute "drop function if exists yawp_server_message_search_vector()"

    alter table(:federation_inbox_entries) do
      remove :search_vector
    end

    alter table(:server_messages) do
      remove :search_vector
    end
  end
end
