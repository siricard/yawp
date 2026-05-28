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
    {:ok, server} = Yawp.Servers.get_singleton_server()
    active_invites = load_active_invites(server)

    {:ok,
     socket
     |> assign(:page_title, "Admin")
     |> assign(:active_server_key, active_key)
     |> assign(:active_claim_token, active_claim_token)
     |> assign(:chat_owner, chat_owner)
     |> assign(:server, server)
     |> stream(:server_invites, active_invites)
     |> stream(:audit_log, recent_entries)}
  end

  defp load_active_invites(nil), do: []

  defp load_active_invites(server) do
    case Yawp.Servers.list_active_server_invites(server.id) do
      {:ok, invites} -> invites
      _ -> []
    end
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

  def handle_event("mint_server_invite", params, socket) do
    account = socket.assigns.current_account

    case {socket.assigns.server, socket.assigns.chat_owner} do
      {nil, _} ->
        {:noreply, put_flash(socket, :error, "No server yet — seed has not run.")}

      {_server, nil} ->
        {:noreply,
         put_flash(
           socket,
           :error,
           "No chat owner yet — generate a claim token and complete onboarding first."
         )}

      {server, chat_owner} ->
        mint_attrs = build_mint_attrs(server, params)

        case Yawp.Servers.mint_server_invite(mint_attrs, actor: chat_owner) do
          {:ok, invite} ->
            entry =
              Yawp.Admin.audit!(account.id, "server_invite.mint", %{invite_id: invite.id})

            {:noreply,
             socket
             |> stream_insert(:server_invites, invite, at: 0)
             |> stream_insert(:audit_log, entry, at: 0)
             |> put_flash(
               :info,
               "Server invite minted. Copy the token — it will not be shown again."
             )}

          {:error, _error} ->
            {:noreply, put_flash(socket, :error, "Could not mint server invite.")}
        end
    end
  end

  def handle_event("revoke_server_invite", %{"id" => invite_id}, socket) do
    account = socket.assigns.current_account

    with {:ok, invite} <- Yawp.Servers.get_server_invite_by_id(invite_id),
         {:ok, _} <- Yawp.Servers.revoke_server_invite(invite) do
      entry =
        Yawp.Admin.audit!(account.id, "server_invite.revoke", %{invite_id: invite_id})

      {:noreply,
       socket
       |> stream_delete(:server_invites, invite)
       |> stream_insert(:audit_log, entry, at: 0)
       |> put_flash(:info, "Server invite revoked.")}
    else
      _ -> {:noreply, put_flash(socket, :error, "Could not revoke server invite.")}
    end
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
      <header
        id="admin-header-strip"
        class="flex items-center justify-between gap-4 bg-surface text-text rounded-lg px-4 py-3 mb-4 shadow-card"
      >
        <div>
          <h1 class="font-display text-2xl font-bold text-text">Operator console</h1>
          <p class="text-sm text-text-secondary font-mono">
            <span id="operator-email">{@current_account.email}</span>
          </p>
        </div>
        <.link
          href={~p"/admin/logout"}
          class="inline-flex items-center gap-2 rounded-pill bg-surface-2 hover:bg-surface-3 text-text text-sm font-semibold px-4 py-2"
        >
          <.icon name="hero-arrow-right-on-rectangle" class="size-4" /> Log out
        </.link>
      </header>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <.section id="attachment-backend" title="Attachment backend" icon="hero-paper-clip">
          <p class="text-sm text-text-secondary">
            Local disk (default). S3 backend not yet available.
          </p>
        </.section>

        <.section id="turn-coturn" title="TURN / coturn" icon="hero-signal">
          <p class="text-sm text-text-secondary">
            Voice channels not yet available. No TURN servers configured.
          </p>
        </.section>

        <.section
          id="per-server-defaults"
          title="Per-server defaults"
          icon="hero-adjustments-horizontal"
        >
          <p class="text-sm text-text-secondary">
            Retention policy, attachment size limit, voice participant cap. Read-only for now.
          </p>
          <button
            id="per-server-defaults-acknowledge-btn"
            type="button"
            phx-click="acknowledge_per_server_defaults"
            class={admin_secondary_btn_class("mt-3")}
          >
            Acknowledge defaults
          </button>
        </.section>

        <.section id="body-archive" title="Body archive" icon="hero-archive-box">
          <p class="text-sm text-text-secondary">
            Disabled. Body-archive enforcement not yet available.
          </p>
        </.section>

        <.section id="federation-status" title="Federation status" icon="hero-globe-alt">
          <%= if @active_server_key do %>
            <p class="text-sm text-text">
              Active server key id:
              <code class="font-mono text-xs bg-surface-2 px-1.5 py-0.5 rounded">
                {@active_server_key.key_id}
              </code>
            </p>
            <p class="text-xs text-text-tertiary mt-1">
              No peer servers known yet.
            </p>
          <% else %>
            <p class="text-sm text-warning">No active server key.</p>
          <% end %>
        </.section>

        <.section id="key-rotation" title="Key rotation" icon="hero-key">
          <button
            id="key-rotate-button"
            type="button"
            class={admin_secondary_btn_class() <> " opacity-50 cursor-not-allowed"}
            disabled
          >
            <.icon name="hero-arrow-path" class="size-4" /> Rotate key
          </button>
        </.section>

        <.section id="database-health" title="Database health" icon="hero-circle-stack">
          <.database_health />
        </.section>

        <.section id="chat-owner-management" title="Chat-owner management" icon="hero-user-circle">
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-text mb-1">Chat owner</h3>
              <%= if @chat_owner do %>
                <p
                  id="chat-owner-did"
                  class="text-sm font-mono text-text"
                  title={@chat_owner.did}
                >
                  Chat owner: {truncate_did(@chat_owner.did)}
                </p>
              <% else %>
                <p class="text-sm text-text-secondary">No chat owner yet</p>
              <% end %>
            </div>

            <div>
              <h3 class="text-sm font-semibold text-text mb-2">Claim token</h3>
              <%= if @active_claim_token do %>
                <div class="space-y-2">
                  <code
                    id="claim-token-value"
                    class="block font-mono text-xs bg-surface-2 text-text px-2 py-1 rounded break-all"
                  >
                    {@active_claim_token.token}
                  </code>
                  <div
                    id="claim-token-countdown"
                    phx-hook=".Countdown"
                    phx-update="ignore"
                    data-expires-at={DateTime.to_iso8601(@active_claim_token.expires_at)}
                    class="text-xs text-text-tertiary font-mono"
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
                  <div class="flex gap-2 flex-wrap">
                    <button
                      id="claim-token-copy-btn"
                      type="button"
                      phx-hook=".CopyToClipboard"
                      data-token={@active_claim_token.token}
                      class={admin_secondary_btn_class()}
                    >
                      <.icon name="hero-clipboard" class="size-4" /> Copy
                    </button>
                    <button
                      id="claim-token-replace-btn"
                      type="button"
                      phx-click="generate_claim_token"
                      class={admin_secondary_btn_class()}
                    >
                      <.icon name="hero-arrow-path" class="size-4" /> Replace
                    </button>
                    <button
                      id="claim-token-revoke-btn"
                      type="button"
                      phx-click="revoke_claim_token"
                      class={admin_secondary_btn_class()}
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
                  class={admin_primary_btn_class()}
                >
                  <.icon name="hero-key" class="size-4" /> Generate claim token
                </button>
              <% end %>
            </div>
          </div>
        </.section>

        <.section id="server-invites" title="Server invites" icon="hero-ticket">
          <div class="space-y-3">
            <div class="flex flex-wrap items-end gap-3">
              <button
                id="server-invite-mint-btn"
                type="button"
                phx-click="mint_server_invite"
                class={admin_primary_btn_class()}
                disabled={is_nil(@chat_owner) or is_nil(@server)}
              >
                <.icon name="hero-plus" class="size-4" /> Mint server invite
              </button>

              <form
                id="server-invite-mint-multi-form"
                phx-submit="mint_server_invite"
                class="flex items-end gap-2"
              >
                <input type="hidden" name="kind" value="multi_use" />
                <label class="text-xs flex flex-col">
                  <span class="text-text-tertiary mb-1">Uses</span>
                  <input
                    id="server-invite-mint-multi-uses"
                    type="number"
                    name="uses_remaining"
                    min="2"
                    max="100"
                    value="5"
                    class="w-20 rounded-md bg-surface-2 text-text text-sm px-2 py-1 border border-transparent focus:border-primary outline-none"
                  />
                </label>
                <button
                  id="server-invite-mint-multi-btn"
                  type="submit"
                  class={admin_secondary_btn_class()}
                  disabled={is_nil(@chat_owner) or is_nil(@server)}
                >
                  <.icon name="hero-plus" class="size-4" /> Mint multi-use invite
                </button>
              </form>
              <%= if is_nil(@chat_owner) do %>
                <p class="text-xs text-text-tertiary mt-1">
                  Chat owner must complete claim before invites can be minted.
                </p>
              <% end %>
            </div>
            <ul
              id="server-invites-list"
              phx-update="stream"
              class="divide-y divide-border-soft text-sm"
            >
              <li
                id="server-invites-empty"
                class="only:block hidden py-2 text-text-secondary"
              >
                No active server invites.
              </li>
              <li
                :for={{dom_id, invite} <- @streams.server_invites}
                id={dom_id}
                class="py-2 flex items-center gap-3"
              >
                <code
                  id={"server-invite-token-#{invite.id}"}
                  class="font-mono text-xs bg-surface-2 text-text px-2 py-1 rounded break-all flex-1"
                >
                  {invite.token}
                </code>
                <span class="text-xs text-text-tertiary">
                  {invite_kind_label(invite)}
                </span>
                <button
                  id={"server-invite-revoke-btn-#{invite.id}"}
                  type="button"
                  phx-click="revoke_server_invite"
                  phx-value-id={invite.id}
                  class="inline-flex items-center gap-1 rounded-pill bg-surface-2 text-text text-xs font-semibold px-2 py-1 hover:bg-surface-3"
                >
                  <.icon name="hero-trash" class="size-3" /> Revoke
                </button>
              </li>
            </ul>
          </div>
        </.section>

        <.section id="operator-audit-log" title="Operator audit log" icon="hero-list-bullet">
          <ul
            id="audit-log"
            phx-update="stream"
            class="divide-y divide-border-soft text-sm"
          >
            <li
              id="audit-log-empty"
              class="only:block hidden py-2 text-text-secondary"
            >
              No operator actions logged yet.
            </li>
            <li :for={{dom_id, entry} <- @streams.audit_log} id={dom_id} class="py-2 text-text">
              <span class="font-mono text-xs text-text-tertiary">{entry.inserted_at}</span>
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
    <section
      id={"section-#{@id}"}
      class="rounded-lg bg-surface border border-border-soft p-4 shadow-card"
    >
      <div class="flex items-center gap-2 mb-3 pb-2 border-b border-border-soft">
        <.icon name={@icon} class="size-4 text-text-tertiary" />
        <h2 class="font-semibold text-text">{@title}</h2>
      </div>
      <div id={@id}>{render_slot(@inner_block)}</div>
    </section>
    """
  end

  defp admin_primary_btn_class(extra \\ "") do
    base =
      "inline-flex items-center gap-2 rounded-pill bg-primary text-on-primary text-sm font-semibold px-4 py-2 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"

    if extra == "", do: base, else: base <> " " <> extra
  end

  defp admin_secondary_btn_class(extra \\ "") do
    base =
      "inline-flex items-center gap-2 rounded-pill bg-surface-2 text-text text-sm font-semibold px-4 py-2 hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed"

    if extra == "", do: base, else: base <> " " <> extra
  end

  defp invite_kind_label(%{kind: :multi_use, uses_remaining: ur}) when is_integer(ur) do
    "multi_use (#{ur} uses left)"
  end

  defp invite_kind_label(%{kind: kind}), do: to_string(kind)

  defp build_mint_attrs(server, %{"kind" => "multi_use"} = params) do
    uses =
      params
      |> Map.get("uses_remaining", "5")
      |> parse_uses_remaining()

    %{
      server_id: server.id,
      kind: :multi_use,
      uses_remaining: uses
    }
  end

  defp build_mint_attrs(server, _params) do
    %{server_id: server.id}
  end

  defp parse_uses_remaining(value) when is_binary(value) do
    case Integer.parse(value) do
      {int, _} -> clamp_uses(int)
      :error -> 5
    end
  end

  defp parse_uses_remaining(value) when is_integer(value), do: clamp_uses(value)
  defp parse_uses_remaining(_), do: 5

  defp clamp_uses(int) when int < 2, do: 2
  defp clamp_uses(int) when int > 100, do: 100
  defp clamp_uses(int), do: int

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
        <p class="text-sm flex items-center gap-2 text-text">
          <.icon name="hero-check-circle" class="size-4 text-success" /> Postgres reachable
        </p>
        <p class="text-xs text-text-tertiary mt-1 truncate" title={@version}>{@version}</p>
      <% :error -> %>
        <p class="text-sm flex items-center gap-2 text-danger">
          <.icon name="hero-x-circle" class="size-4" /> Postgres unreachable
        </p>
    <% end %>
    """
  end
end
