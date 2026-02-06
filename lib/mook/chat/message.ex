defmodule Mook.Chat.Message do
  @moduledoc """
  A single chat message inside a `Mook.Chat.Room`.

  ## schema

      id uuid pk
      room_id uuid fk -> rooms.id (required)
      sender_did text required
      content text required # plaintext
      ciphertext_envelope jsonb nullable # (E2EE)
      home_server text nullable # (federation)
      inserted_at utc_datetime_usec

  ## Message ordering

  Messages within a room are ordered by `inserted_at` (microsecond
  precision). The room's chronological message stream is therefore
  `Message |> filter(room_id == ^room_id) |> sort(:inserted_at)`. We
  intentionally do NOT introduce a monotonic `sequence` integer for
  * The application is single-server ; there is no clock
      skew across nodes to reconcile.
    * Postgres' `utc_datetime_usec` resolution (1µs) is enough to
      disambiguate messages produced within a single dev session.
    * A `sequence` column would have to be co-managed with the message
      broadcast and federation, which is out of scope here.

  When introduces federation + E2EE, message ordering will move
  to a hybrid (logical clock + sender DID tiebreaker) — see
  `docs/`.

  An index on `(room_id, inserted_at)` is created at the postgres layer
  so the chronological-by-room query stays cheap as messages accumulate.
  """

  use Ash.Resource,
    otp_app: :mook,
    domain: Mook.Chat,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "messages"
    repo Mook.Repo

    migration_types ciphertext_envelope: :jsonb

    references do
                  reference :room, on_delete: :delete, index?: true
    end

            custom_indexes do
      index [:room_id, :inserted_at]
    end
  end

  typescript do
    type_name "Message"
  end

  actions do
    defaults [:read]

    create :create do
      description "Create a new chat message in a room."

      accept [
        :room_id,
        :sender_did,
        :content,
        :ciphertext_envelope,
        :home_server
      ]
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :sender_did, :string do
      allow_nil? false
      public? true
      description "DID of the user who sent the message."
    end

    attribute :content, :string do
      allow_nil? false
      public? true
      description "Plaintext content. Replaced by ciphertext_envelope ."
    end

    attribute :ciphertext_envelope, :map do
      allow_nil? true
      public? true
      description "E2EE payload — reserved . Nullable ."
    end

    attribute :home_server, :string do
      allow_nil? true
      public? true
      description "Federation reservation. Nullable ."
    end

                create_timestamp :inserted_at, public?: true, writable?: false
  end

  relationships do
    belongs_to :room, Mook.Chat.Room do
      attribute_type :uuid
      allow_nil? false
      public? true
      description "FK to the room this message belongs to."
    end
  end
end
