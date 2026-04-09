defmodule YawpWeb.AdminDashboardLive do
  @moduledoc """
  Operator-panel dashboard at `/admin`.

  Gated by `YawpWeb.LiveUserAuth.on_mount/4` `:live_operator_required`
  in the router's `ash_authentication_live_session`. Renders the
   dashboard surface: nine sections, each gets a stable DOM id
  (`#section-<slug>`) so downstream features can graft their UI in without
  reworking the layout.

  The federation-status section reads the currently-active server key
  via `Yawp.Federation.get_active_server_key/0` and renders the
  `key_id`. All other non-claim sections render skeleton copy and
  show the placeholder controls promised by the validation contract.
  """

  use YawpWeb, :live_view

  on_mount {YawpWeb.LiveUserAuth, :live_operator_required}

  @impl true
  def mount(_params, _session, socket) do
    {:ok, active_key} = Yawp.Federation.get_active_server_key()
    {:ok, recent_entries} = Yawp.Admin.list_recent_audit_entries()
    {:ok, active_claim_token} = Yawp.Admin.get_active_claim_token()
    {:ok, chat_owner} = Yawp.Identity.get_chat_owner()

    {:ok,
     socket
     |> assign(:page_title, "Admin")
     |> assign(:active_server_key, active_key)
     |> assign(:active_claim_token, active_claim_token)
     |> assign(:chat_owner, chat_owner)
     |> stream(:audit_log, recent_entries)}
  end

  @impl true
  def handle_event("generate_claim_token", _params, socket) do
    account = socket.assigns.current_account
    prior_token = socket.assigns.active_claim_token

    {:ok, token} =
      Yawp.Admin.generate_claim_token(%{created_by_account_id: account.id})

    revoke_entry =
      if prior_token do
        Yawp.Admin.audit!(account.id, "claim_token.revoke", %{token_id: prior_token.id})
      end

    generate_entry =
      Yawp.Admin.audit!(account.id, "claim_token.generate", %{token_id: token.id})

    socket = assign(socket, :active_claim_token, token)

    socket =
      if revoke_entry,
        do: stream_insert(socket, :audit_log, revoke_entry, at: 0),
        else: socket

    socket = stream_insert(socket, :audit_log, generate_entry, at: 0)

    {:noreply,
     put_flash(socket, :info, "Claim token generated. Copy it now — it will not be shown again.")}
  end

  def handle_event("acknowledge_per_server_defaults", _params, socket) do
    account = socket.assigns.current_account

    entry =
      Yawp.Admin.audit!(account.id, "settings.change", %{
        section: "per-server-defaults",
        change: "acknowledged"
      })

    {:noreply,
     socket
     |> stream_insert(:audit_log, entry, at: 0)
     |> put_flash(:info, "Per-server defaults acknowledged (stub — real settings land in M8).")}
  end

  def handle_event("revoke_claim_token", _params, socket) do
    account = socket.assigns.current_account

    case socket.assigns.active_claim_token do
      nil ->
        {:noreply, socket}

      token ->
        {:ok, _revoked} = Yawp.Admin.revoke_claim_token(token)

        entry =
          Yawp.Admin.audit!(account.id, "claim_token.revoke", %{token_id: token.id})

        {:noreply,
         socket
         |> assign(:active_claim_token, nil)
         |> stream_insert(:audit_log, entry, at: 0)
         |> put_flash(:info, "Claim token revoked.")}
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        Operator console
        <:subtitle>
          <span id="operator-email">{@current_account.email}</span>
        </:subtitle>
        <:actions>
          <.link href={~p"/admin/logout"} class="btn btn-ghost">
            <.icon name="hero-arrow-right-on-rectangle" class="size-4" /> Log out
          </.link>
        </:actions>
      </.header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <.section id="attachment-backend" title="Attachment backend" icon="hero-paper-clip">
          <p class="text-sm text-base-content/70">
            Local disk (default). S3 backend lands with ADR 022 in M8.
          </p>
        </.section>

        <.section id="turn-coturn" title="TURN / coturn" icon="hero-signal">
          <p class="text-sm text-base-content/70">
            Voice channels and coturn configuration land in M8 (ADR 020). No TURN servers configured.
          </p>
        </.section>

        <.section
          id="per-server-defaults"
          title="Per-server defaults"
          icon="hero-adjustments-horizontal"
        >
          <p class="text-sm text-base-content/70">
            Retention policy, attachment size limit, voice participant cap. Read-only stub for now.
          </p>
          <button
            id="per-server-defaults-acknowledge-btn"
            type="button"
            phx-click="acknowledge_per_server_defaults"
            class="btn btn-sm btn-soft mt-2"
          >
            Acknowledge defaults (stub — lands in M8)
          </button>
        </.section>

        <.section id="body-archive" title="Body archive" icon="hero-archive-box">
          <p class="text-sm text-base-content/70">
            Disabled. Body-archive enforcement lands with ADR 019 in M8.
          </p>
        </.section>

        <.section id="federation-status" title="Federation status" icon="hero-globe-alt">
          <%= if @active_server_key do %>
            <p class="text-sm">
              Active server key id: <code class="font-mono text-xs">{@active_server_key.key_id}</code>
            </p>
            <p class="text-xs text-base-content/70 mt-1">
              No peer servers known yet — federation sync lands in M7.4.
            </p>
          <% else %>
            <p class="text-sm text-warning">No active server key.</p>
          <% end %>
        </.section>

        <.section id="key-rotation" title="Key rotation" icon="hero-key">
          <button id="key-rotate-button" type="button" class="btn btn-soft" disabled>
            <.icon name="hero-arrow-path" class="size-4" /> Rotate key (M7.4)
          </button>
        </.section>

        <.section id="database-health" title="Database health" icon="hero-circle-stack">
          <.database_health />
        </.section>

        <.section id="chat-owner-management" title="Chat-owner management" icon="hero-user-circle">
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold mb-1">Chat owner</h3>
              <%= if @chat_owner do %>
                <p
                  id="chat-owner-did"
                  class="text-sm font-mono"
                  title={@chat_owner.did}
                >
                  Chat owner: {truncate_did(@chat_owner.did)}
                </p>
              <% else %>
                <p class="text-sm text-base-content/70">No chat owner yet</p>
              <% end %>
            </div>

            <div>
              <h3 class="text-sm font-semibold mb-2">Claim token</h3>
              <%= if @active_claim_token do %>
                <div class="space-y-2">
                  <code
                    id="claim-token-value"
                    class="block font-mono text-xs bg-base-200 px-2 py-1 rounded break-all"
                  >
                    {@active_claim_token.token}
                  </code>
                  <div
                    id="claim-token-countdown"
                    phx-hook=".Countdown"
                    phx-update="ignore"
                    data-expires-at={DateTime.to_iso8601(@active_claim_token.expires_at)}
                    class="text-xs text-base-content/70 font-mono"
                  >
                    expires in …
                  </div>
                  <script :type={Phoenix.LiveView.ColocatedHook} name=".Countdown">
                    export default {
                      mounted() {
                        this.tick = this.tick.bind(this)
                        this.expiresAt = new Date(this.el.dataset.expiresAt).getTime()
                        this.timer = setInterval(this.tick, 1000)
                        this.tick()
                      },
                      updated() {
                        this.expiresAt = new Date(this.el.dataset.expiresAt).getTime()
                        this.tick()
                      },
                      destroyed() {
                        clearInterval(this.timer)
                      },
                      tick() {
                        const remaining = Math.max(0, this.expiresAt - Date.now())
                        const totalSeconds = Math.floor(remaining / 1000)
                        const minutes = Math.floor(totalSeconds / 60)
                        const seconds = totalSeconds % 60
                        const pad = (n) => String(n).padStart(2, "0")
                        this.el.textContent =
                          remaining === 0
                            ? "expired"
                            : `expires in ${pad(minutes)}:${pad(seconds)}`
                      }
                    }
                  </script>
                  <div class="flex gap-2">
                    <button
                      id="claim-token-copy-btn"
                      type="button"
                      phx-hook=".CopyToClipboard"
                      data-token={@active_claim_token.token}
                      class="btn btn-sm btn-soft"
                    >
                      <.icon name="hero-clipboard" class="size-4" /> Copy
                    </button>
                    <button
                      id="claim-token-replace-btn"
                      type="button"
                      phx-click="generate_claim_token"
                      class="btn btn-sm btn-soft"
                    >
                      <.icon name="hero-arrow-path" class="size-4" /> Replace
                    </button>
                    <button
                      id="claim-token-revoke-btn"
                      type="button"
                      phx-click="revoke_claim_token"
                      class="btn btn-sm btn-soft"
                    >
                      <.icon name="hero-trash" class="size-4" /> Revoke
                    </button>
                  </div>
                  <script :type={Phoenix.LiveView.ColocatedHook} name=".CopyToClipboard">
                    export default {
                      mounted() {
                        this.el.addEventListener("click", () => {
                          const token = this.el.dataset.token || ""
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(token)
                          }
                        })
                      }
                    }
                  </script>
                </div>
              <% else %>
                <button
                  id="claim-token-generate-btn"
                  type="button"
                  phx-click="generate_claim_token"
                  class="btn btn-sm btn-primary"
                >
                  <.icon name="hero-key" class="size-4" /> Generate claim token
                </button>
              <% end %>
            </div>
          </div>
        </.section>

        <.section id="operator-audit-log" title="Operator audit log" icon="hero-list-bullet">
          <ul
            id="audit-log"
            phx-update="stream"
            class="divide-y divide-base-300 text-sm"
          >
            <li
              id="audit-log-empty"
              class="only:block hidden py-2 text-base-content/70"
            >
              No operator actions logged yet.
            </li>
            <li :for={{dom_id, entry} <- @streams.audit_log} id={dom_id} class="py-2">
              <span class="font-mono text-xs text-base-content/70">{entry.inserted_at}</span>
              <span class="ml-2">{entry.action}</span>
            </li>
          </ul>
        </.section>
      </div>
    </Layouts.app>
    """
  end

  attr :id, :string, required: true
  attr :title, :string, required: true
  attr :icon, :string, required: true
  slot :inner_block, required: true

  defp section(assigns) do
    ~H"""
    <section id={"section-#{@id}"} class="card bg-base-100 border border-base-300 p-4">
      <div class="flex items-center gap-2 mb-3">
        <.icon name={@icon} class="size-4 text-base-content/70" />
        <h2 class="font-semibold">{@title}</h2>
      </div>
      <div id={@id}>{render_slot(@inner_block)}</div>
    </section>
    """
  end

      defp truncate_did(did) when is_binary(did) do
    if String.length(did) <= 28 do
      did
    else
      String.slice(did, 0, 16) <> "…" <> String.slice(did, -8, 8)
    end
  end

  defp database_health(assigns) do
    {status, version} =
      try do
        %Postgrex.Result{rows: [[v]]} =
          Ecto.Adapters.SQL.query!(Yawp.Repo, "SELECT version()", [])

        {:ok, v}
      rescue
        _ -> {:error, nil}
      end

    assigns = assign(assigns, status: status, version: version)

    ~H"""
    <%= case @status do %>
      <% :ok -> %>
        <p class="text-sm flex items-center gap-2">
          <.icon name="hero-check-circle" class="size-4 text-success" /> Postgres reachable
        </p>
        <p class="text-xs text-base-content/70 mt-1 truncate" title={@version}>{@version}</p>
      <% :error -> %>
        <p class="text-sm flex items-center gap-2 text-error">
          <.icon name="hero-x-circle" class="size-4" /> Postgres unreachable
        </p>
    <% end %>
    """
  end
end
