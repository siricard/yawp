# Yawp

## Running everything locally

All project commands should run through the Nix dev shell. The `justfile` recipes already wrap the commands with `nix develop -c`.

### One-time setup

```bash
just setup
```

### Phoenix and the React web client

Start Phoenix:

```bash
just dev
```

Then visit [`http://localhost:4000`](http://localhost:4000). Phoenix serves the React web client from `assets/js/index.tsx`, mounted into `#app`.

Build web assets with:

```bash
nix develop -c mix assets.build
```

That writes the compiled React bundle to `priv/static/assets/index.js`.

### React Native Metro and simulators

Start Metro in its own terminal before launching any native target:

```bash
just rn-metro
```

Keep `just rn-metro` running, then open a second terminal and launch the platform you want:

```bash
just rn-ios
just rn-android
just rn-macos
```

`just rn-metro` **must be running before** `just rn-ios`, `just rn-android`, or `just rn-macos` is invoked. If Metro is not already listening on port 8081, the launched React Native app can show the redbox error `No script URL provided`.

## Self-hosting

This section walks a stranger through bringing up a Yawp instance on a fresh
Ubuntu VPS. The runbook is self-contained — no other doc is required.

### Prerequisites

* Ubuntu 22.04 LTS or newer (24.04 also tested).
* Docker Engine 24+ and the **Compose v2** plugin (`docker compose`, not the
  legacy `docker-compose` binary). Install via the official Docker apt repo:

  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  newgrp docker   # or log out / back in
  docker compose version   # must print v2.x
  ```

* Ports **80** and **443** open inbound on the VPS firewall if you intend to
  serve traffic publicly (you'll terminate TLS in a reverse proxy and forward
  to `PHX_PORT`, default `4000`). For a quick private trial, just `4000` is
  enough.
* A copy of this repository on the VPS (`git clone`) so you have the
  `docker-compose.yml`, `Dockerfile`, and `.env.example` alongside each other.

### 1. Generate secrets

Yawp requires two independent 64-byte random secrets — one signs Plug session
cookies (`SECRET_KEY_BASE`), the other signs AshAuthentication tokens
(`TOKEN_SIGNING_SECRET`). Generate them with:

```bash
openssl rand -base64 64 | tr -d '\n'   # paste into SECRET_KEY_BASE
openssl rand -base64 64 | tr -d '\n'   # paste into TOKEN_SIGNING_SECRET
```

Run the command twice — never reuse the same value for both. Store the
results in a password manager; rotating them invalidates all existing
sessions and tokens respectively.

### 2. Configure the environment file

Copy the template and fill it in:

```bash
cp .env.example .env
nano .env
```

The required variables are:

* `PHX_HOST` — the public hostname clients will reach (no scheme, no port).
* `SECRET_KEY_BASE` — from step 1.
* `TOKEN_SIGNING_SECRET` — from step 1.
* `POSTGRES_PASSWORD` — pick a strong password for the bundled Postgres.
* `DATABASE_URL` — Ecto connection string. The hostname `postgres` refers to
  the sibling compose service. The literal format is shown inside the fenced
  code block below, split into its four parts on separate lines so the shape
  is unambiguous — concatenate them with **no spaces between parts** to
  produce the actual value you paste into `.env`:

  ```
  ecto://
  USER:PASSWORD
  @postgres
  /DB
  ```

  `USER` and `PASSWORD` are the values of `POSTGRES_USER` and
  `POSTGRES_PASSWORD` you set above; `DB` is `POSTGRES_DB`. If your password
  contains URL-reserved characters (`@`, `:`, `/`, `#`, `?`, `%`), URL-encode
  them before pasting. The commented template at the bottom of
  `.env.example` shows the same assembly inline.

`PHX_PORT` defaults to `4000`; set it to `80` (and front it with a reverse
proxy like Caddy or nginx for TLS) for a public deployment. All other
variables are optional with sensible defaults — read the comments in
`.env.example`.

### 3. Bring the stack up

From the directory containing `docker-compose.yml` and the `.env` you just
filled in:

```bash
docker compose up -d
```

By default this pulls the prebuilt image `ghcr.io/siricard/yawp:latest` from
GHCR. To pin a specific release, set `YAWP_IMAGE` in `.env`
(e.g. `YAWP_IMAGE=ghcr.io/siricard/yawp:v0.1.0`). To build locally instead of
pulling, run `docker compose build` first.

Verify both services are healthy:

```bash
docker compose ps          # both services should show "healthy"
curl -sS http://127.0.0.1:4000/version
```

The `/version` endpoint returns `{version, commit, built_at}` baked in at
image build time — use it to confirm which release is running.

### 4. Upgrade flow

To upgrade to a newer image:

```bash
docker compose pull        # fetches the new image tag
docker compose up -d       # recreates only the changed containers
```

`docker compose up -d` is idempotent — it leaves Postgres untouched if its
image hasn't changed, and only recreates the Phoenix container with the new
release. Database migrations run automatically at boot via the release's
`bin/server` entrypoint.

If you pinned `YAWP_IMAGE` in `.env`, bump the tag there before running
`docker compose pull`.

### 5. Troubleshooting

* **View logs** — tail everything, or scope to one service:

  ```bash
  docker compose logs -f                # both services, follow
  docker compose logs --tail=200 phoenix
  docker compose logs --tail=200 postgres
  ```

* **Reload environment after editing `.env`** — compose only re-reads `.env`
  when containers are recreated:

  ```bash
  docker compose up -d --force-recreate phoenix
  ```

  Use `--force-recreate` (not `restart`) so the new env vars are picked up.

* **Reset the database** — destroys all data; only use during initial setup
  or recovery:

  ```bash
  docker compose down -v          # -v removes the postgres_data volume
  docker compose up -d            # fresh Postgres, migrations rerun
  ```

* **Phoenix container restarts in a loop** — almost always a missing or
  malformed required env var. Check `docker compose logs phoenix` for the
  first error after boot; common culprits are an unset `DATABASE_URL` or a
  `SECRET_KEY_BASE` shorter than 64 bytes.

* **`docker compose pull` says "manifest not found"** — the image tag you
  pinned in `YAWP_IMAGE` doesn't exist on GHCR. List available tags:
  `gh api /orgs/siricard/packages/container/yawp/versions` (or browse the
  package page on github.com).

## Contributing

Contributions to the AGPL-3.0 core (`apps/yawp/`) are welcome. Before opening
a PR, please read:

* [`CONTRIBUTING.md`](CONTRIBUTING.md) — fork → branch → PR flow, the DCO
  sign-off requirement, and the Contributor License Agreement.
* [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — community standards, based on
  the Contributor Covenant.
* [`SECURITY.md`](SECURITY.md) — responsible disclosure for vulnerabilities.

The proprietary premium tier (`apps/yawp_premium/`) does not accept external
contributions.

## Learn more

* Official website: https://www.phoenixframework.org/
* Guides: https://hexdocs.pm/phoenix/overview.html
* Docs: https://hexdocs.pm/phoenix
* Forum: https://elixirforum.com/c/phoenix-forum
* Source: https://github.com/phoenixframework/phoenix
