defmodule YawpWeb.AdminSetupHTML do
  @moduledoc """
  Templates for the first-boot operator-account setup controller. Intentionally minimal — pre-LiveView, no Layouts.app.
  """

  use YawpWeb, :html

  def new(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="csrf-token" content={get_csrf_token()} />
        <title>Yawp — first-boot setup</title>
        <link phx-track-static rel="stylesheet" href={~p"/assets/css/app.css"} />
      </head>
      <body class="min-h-screen bg-base-200 flex items-center justify-center px-4 py-12">
        <main class="w-full max-w-md">
          <header class="mb-6">
            <h1 class="text-2xl font-semibold">Create the first operator</h1>
            <p class="text-sm text-base-content/70 mt-1">
              This page is only available on first boot. After the account is created the
              setup endpoint is permanently disabled on this server.
            </p>
          </header>

          <%= if @errors != [] do %>
            <div id="admin-setup-errors" class="alert alert-error mb-4">
              <ul class="list-disc list-inside">
                <li :for={msg <- @errors}>{msg}</li>
              </ul>
            </div>
          <% end %>

          <form id="admin-setup-form" method="post" action={~p"/admin/setup"} class="space-y-4">
            <input type="hidden" name="_csrf_token" value={get_csrf_token()} />
            <input type="hidden" name="token" value={@token} />

            <label class="block">
              <span class="label mb-1">Email</span>
              <input
                id="admin-setup-email"
                type="email"
                name="email"
                value={@email}
                required
                autocomplete="username"
                class="w-full input"
              />
            </label>

            <label class="block">
              <span class="label mb-1">Password</span>
              <input
                id="admin-setup-password"
                type="password"
                name="password"
                required
                autocomplete="new-password"
                minlength="8"
                class="w-full input"
              />
            </label>

            <label class="block">
              <span class="label mb-1">Confirm password</span>
              <input
                id="admin-setup-password-confirmation"
                type="password"
                name="password_confirmation"
                required
                autocomplete="new-password"
                minlength="8"
                class="w-full input"
              />
            </label>

            <button
              id="admin-setup-submit"
              type="submit"
              class="btn btn-primary w-full"
              phx-disable-with="Creating…"
            >
              Create operator account
            </button>
          </form>
        </main>
      </body>
    </html>
    """
  end

  def setup_failed(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Yawp — setup failed</title>
        <link phx-track-static rel="stylesheet" href={~p"/assets/css/app.css"} />
      </head>
      <body class="min-h-screen bg-base-200 flex items-center justify-center px-4 py-12">
        <main id="admin-setup-failed" class="w-full max-w-md">
          <header class="mb-6">
            <h1 class="text-2xl font-semibold">Setup failed — server restart required</h1>
            <p class="text-sm text-base-content/70 mt-2">
              The setup token was consumed but the operator account could not be created.
              The token cannot be reused. To try again, <strong>restart the server</strong>
              — on next boot it will mint a fresh setup token and log a new setup link.
            </p>
          </header>

          <%= if @errors != [] do %>
            <div id="admin-setup-failed-errors" class="alert alert-error mb-4">
              <p class="font-semibold mb-2">Validation errors from the submitted form:</p>
              <ul class="list-disc list-inside">
                <li :for={msg <- @errors}>{msg}</li>
              </ul>
            </div>
          <% end %>

          <p class="text-sm text-base-content/70">
            After restarting the server, check the startup log for the new
            <code>/admin/setup?token=…</code>
            link.
          </p>
        </main>
      </body>
    </html>
    """
  end

  def forbidden(assigns) do
    ~H"""
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Yawp — setup unavailable</title>
        <link phx-track-static rel="stylesheet" href={~p"/assets/css/app.css"} />
      </head>
      <body class="min-h-screen bg-base-200 flex items-center justify-center px-4 py-12">
        <main class="w-full max-w-md text-center">
          <h1 class="text-2xl font-semibold mb-2">
            <%= case @reason do %>
              <% :setup_complete -> %>
                Setup already complete
              <% :invalid_token -> %>
                Invalid or missing setup token
            <% end %>
          </h1>
          <p class="text-sm text-base-content/70">
            <%= case @reason do %>
              <% :setup_complete -> %>
                This server already has an operator account. The first-boot setup
                endpoint is permanently disabled.
              <% :invalid_token -> %>
                The token in your URL does not match the current setup token. Check
                the server's startup log for the correct setup link.
            <% end %>
          </p>
        </main>
      </body>
    </html>
    """
  end
end
