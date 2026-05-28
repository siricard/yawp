defmodule Yawp.Admin.Account do
  @moduledoc """
  Password-bearing operator account.

   trimmed the AshAuthentication surface to email +
  password with Argon2id hashing via `argon2_elixir`. There is no
  magic-link, no email confirmation, and no operator-facing password
  reset flow — operator recovery is out-of-band (SSH + Mix task),.

  Token issuance and storage are still wired through
  `Yawp.Admin.Token` so the sign-in path can mint a JWT and the
  `/admin/login` LiveView can exchange it.

  The first-boot setup endpoint reaches this resource via the
  domain code interface `Yawp.Admin.create_account/2`.
  """

  use Ash.Resource,
    otp_app: :yawp,
    domain: Yawp.Admin,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshAuthentication, AshTypescript.Resource]

  authentication do
    tokens do
      enabled? true
      token_resource Yawp.Admin.Token
      signing_secret Yawp.Secrets
      store_all_tokens? true
      require_token_presence_for_authentication? true
    end

    strategies do
      password :password do
        identity_field :email
        hash_provider AshAuthentication.Argon2Provider
        registration_enabled? false
      end
    end
  end

  postgres do
    table "users"
    repo Yawp.Repo
  end

  typescript do
    type_name "AdminAccount"
  end

  actions do
    defaults [:read]

    read :get_by_subject do
      description "Get an admin account by the subject claim in a JWT"
      argument :subject, :string, allow_nil?: false
      get? true
      prepare AshAuthentication.Preparations.FilterBySubject
    end

    read :get_by_email do
      description "Look up an admin account by email"
      get_by :email
    end

    read :sign_in_with_password do
      description "Sign in using email + password"
      get? true

      argument :email, :ci_string do
        allow_nil? false
      end

      argument :password, :string do
        allow_nil? false
        sensitive? true
      end

      prepare AshAuthentication.Strategy.Password.SignInPreparation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the account."
        allow_nil? false
      end
    end

    create :create_account do
      description """
      Creates an operator account. Used by the first-boot setup
      endpoint and by the admin dashboard if the operator
      adds another sysadmin handoff account.
      """

      argument :email, :ci_string do
        allow_nil? false
      end

      argument :password, :string do
        allow_nil? false
        sensitive? true
        constraints min_length: 8
      end

      argument :password_confirmation, :string do
        allow_nil? false
        sensitive? true
      end

      change set_attribute(:email, arg(:email))
      change set_context(%{strategy_name: :password})

      validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation
      change AshAuthentication.Strategy.Password.HashPasswordChange
    end

    update :touch_last_login do
      description "Stamps last_login_at = now() after a successful sign-in."
      accept []
      change set_attribute(:last_login_at, &DateTime.utc_now/0)
    end
  end

  policies do
    bypass AshAuthentication.Checks.AshAuthenticationInteraction do
      authorize_if always()
    end

    policy action(:create_account) do
      authorize_if always()
    end

    policy action(:touch_last_login) do
      authorize_if always()
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :email, :ci_string do
      allow_nil? false
      public? true
    end

    attribute :hashed_password, :string do
      allow_nil? false
      sensitive? true
    end

    attribute :last_login_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    create_timestamp :inserted_at
  end

  identities do
    identity :unique_email, [:email]
  end
end
