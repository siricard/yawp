defmodule Mook.Accounts.User do
  use Ash.Resource,
    otp_app: :mook,
    domain: Mook.Accounts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshAuthentication, AshTypescript.Resource]

  authentication do
    add_ons do
      log_out_everywhere do
        apply_on_password_change? true
      end

      confirmation :confirm_new_user do
        monitor_fields [:email]
        confirm_on_create? true
        confirm_on_update? false
        require_interaction? true
        confirmed_at_field :confirmed_at
        auto_confirm_actions [:sign_in_with_magic_link, :reset_password_with_token]
        sender Mook.Accounts.User.Senders.SendNewUserConfirmationEmail
      end
    end

    tokens do
      enabled? true
      token_resource Mook.Accounts.Token
      signing_secret Mook.Secrets
      store_all_tokens? true
      require_token_presence_for_authentication? true
    end

    strategies do
      password :password do
        identity_field :email
        hash_provider AshAuthentication.BcryptProvider

        resettable do
          sender Mook.Accounts.User.Senders.SendPasswordResetEmail
                    password_reset_action_name :reset_password_with_token
          request_password_reset_action_name :request_password_reset_token
        end
      end

      remember_me :remember_me
    end
  end

  postgres do
    table "users"
    repo Mook.Repo

            migration_types recovery_methods: :jsonb
    migration_defaults recovery_methods: "fragment(\"'[]'::jsonb\")"
  end

  typescript do
    type_name "User"
  end

  actions do
    defaults [:read]

    read :get_by_subject do
      description "Get a user by the subject claim in a JWT"
      argument :subject, :string, allow_nil?: false
      get? true
      prepare AshAuthentication.Preparations.FilterBySubject
    end

    update :change_password do
            
      require_atomic? false
      accept []
      argument :current_password, :string, sensitive?: true, allow_nil?: false

      argument :password, :string,
        sensitive?: true,
        allow_nil?: false,
        constraints: [min_length: 8]

      argument :password_confirmation, :string, sensitive?: true, allow_nil?: false

      validate confirm(:password, :password_confirmation)

      validate {AshAuthentication.Strategy.Password.PasswordValidation,
                strategy_name: :password, password_argument: :current_password}

      change {AshAuthentication.Strategy.Password.HashPasswordChange, strategy_name: :password}
    end

    read :sign_in_with_password do
      description "Attempt to sign in using a email and password."
      get? true

      argument :email, :ci_string do
        description "The email to use for retrieving the user."
        allow_nil? false
      end

      argument :password, :string do
        description "The password to check for the matching user."
        allow_nil? false
        sensitive? true
      end

            prepare AshAuthentication.Strategy.Password.SignInPreparation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    read :sign_in_with_token do
                                          
      description "Attempt to sign in using a short-lived sign in token."
      get? true

      argument :token, :string do
        description "The short-lived sign in token."
        allow_nil? false
        sensitive? true
      end

            prepare AshAuthentication.Strategy.Password.SignInWithTokenPreparation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    create :register_with_pubkey do
      description "Register a new user identified by an Ed25519 public key. Derives DID server-side."

      accept [:public_key, :home_server]

      validate present(:public_key)

      change fn changeset, _ctx ->
        case Ash.Changeset.get_attribute(changeset, :public_key) do
          pk when is_binary(pk) ->
            Ash.Changeset.force_change_attribute(
              changeset,
              :did,
              Mook.Identity.did_from_pubkey(pk)
            )

          _ ->
            changeset
        end
      end
    end

    create :register_with_password do
      description "Register a new user with a email and password."

      argument :email, :ci_string do
        allow_nil? false
      end

      argument :password, :string do
        description "The proposed password for the user, in plain text."
        allow_nil? false
        constraints min_length: 8
        sensitive? true
      end

      argument :password_confirmation, :string do
        description "The proposed password for the user (again), in plain text."
        allow_nil? false
        sensitive? true
      end

            change set_attribute(:email, arg(:email))

            change AshAuthentication.Strategy.Password.HashPasswordChange

            change AshAuthentication.GenerateTokenChange

            validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    action :request_password_reset_token do
      description "Send password reset instructions to a user if they exist."

      argument :email, :ci_string do
        allow_nil? false
      end

            run {AshAuthentication.Strategy.Password.RequestPasswordReset, action: :get_by_email}
    end

    read :get_by_email do
      description "Looks up a user by their email"
      get_by :email
    end

    update :reset_password_with_token do
      argument :reset_token, :string do
        allow_nil? false
        sensitive? true
      end

      argument :password, :string do
        description "The proposed password for the user, in plain text."
        allow_nil? false
        constraints min_length: 8
        sensitive? true
      end

      argument :password_confirmation, :string do
        description "The proposed password for the user (again), in plain text."
        allow_nil? false
        sensitive? true
      end

            validate AshAuthentication.Strategy.Password.ResetTokenValidation

            validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation

            change AshAuthentication.Strategy.Password.HashPasswordChange

            change AshAuthentication.GenerateTokenChange
    end
  end

  policies do
    bypass AshAuthentication.Checks.AshAuthenticationInteraction do
      authorize_if always()
    end

                            policy action(:register_with_pubkey) do
      authorize_if always()
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :email, :ci_string do
      allow_nil? true
      public? true
    end

    attribute :hashed_password, :string do
      allow_nil? true
      sensitive? true
    end

    attribute :confirmed_at, :utc_datetime_usec

    attribute :public_key, :binary do
      allow_nil? true
      public? true
      description "Raw Ed25519 public key bytes (32). Set on register_with_pubkey."
    end

    attribute :did, :string do
      allow_nil? true
      public? true
      description "base58(SHA-256(public_key)). Derived on create."
    end

    attribute :home_server, :string do
      allow_nil? true
      public? true
      description "Federation reservation."
    end

    attribute :recovery_methods, {:array, :map} do
      allow_nil? false
      default []
      public? true
      description "Identity recovery reservation."
    end
  end

  identities do
    identity :unique_email, [:email], nils_distinct?: true
    identity :unique_public_key, [:public_key], nils_distinct?: true
    identity :unique_did, [:did], nils_distinct?: true
  end
end
