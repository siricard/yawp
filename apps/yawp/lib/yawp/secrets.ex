defmodule Yawp.Secrets do
  use AshAuthentication.Secret

  def secret_for(
        [:authentication, :tokens, :signing_secret],
        Yawp.Admin.Account,
        _opts,
        _context
      ) do
    Application.fetch_env(:yawp, :token_signing_secret)
  end
end
