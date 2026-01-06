defmodule Mook.Secrets do
  use AshAuthentication.Secret

  def secret_for([:authentication, :tokens, :signing_secret], Mook.Accounts.User, _opts, _context) do
    Application.fetch_env(:mook, :token_signing_secret)
  end
end
