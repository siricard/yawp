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

    {:ok,
     socket
     |> assign(:page_title, "Admin")
     |> assign(:active_server_key, active_key)
     |> stream(:audit_log, recent_entries)}
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
          <p class="text-sm text-base-content/70">
            No chat owner yet. Claim-token issuance ships in F7.1.5.
          </p>
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
