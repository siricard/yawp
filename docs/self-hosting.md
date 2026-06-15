# Self-hosting Yawp

This runbook takes you from a fresh VPS and a domain name to a running Yawp server with HTTPS, persistent storage, and a claimed operator account. It assumes Ubuntu 22.04 LTS or newer, but the Docker Compose workflow is the same on any host with Docker Engine and Compose v2.

## Prerequisites

### VPS sizing

Use a VPS with at least:

- 2 vCPU
- 2 GB RAM
- 20 GB SSD storage
- Ubuntu 22.04 LTS or 24.04 LTS
- Root or sudo access

For a small friend or family server, that is enough. Choose more disk if you expect large attachment uploads, because Postgres and the uploads volume both live on the VPS by default.

### Domain and DNS

Pick the hostname people will use to reach the server, for example `chat.example.com`. Create an `A` record for that hostname pointing at your VPS public IPv4 address. If your VPS has IPv6, also create an `AAAA` record pointing at its IPv6 address.

Check DNS from your laptop before you start TLS:

```bash
dig +short chat.example.com A
dig +short chat.example.com AAAA
```

For local testing on your Mac, use `localhost` instead of your domain.

### One-command bring-up

Paste this on the VPS, replacing the hostname:

```bash
curl -fsSL https://raw.githubusercontent.com/siricard/yawp/main/scripts/bootstrap-staging.sh | sudo bash -s -- --hostname chat.example.com
```

The bootstrap script installs missing prerequisites, clones or updates the repository in `/opt/yawp`, runs the provisioning script, pulls the published image, and starts the stack. If the image is not public or not published yet, it prints a clear message and builds locally instead. Re-running the command updates the checkout, keeps the existing `.env`, and restarts the stack.

If you already cloned the repository, run the same script from the checkout:

```bash
sudo bash scripts/bootstrap-staging.sh --app-dir "$PWD" --app-user "${SUDO_USER:-$(id -un)}" --hostname chat.example.com
```

After provisioning, verify Docker if you need to debug the host:

```bash
docker version
docker compose version
```

`docker compose version` must print Compose v2. Use the space form, `docker compose`, not the old `docker-compose` binary.

## Configuration

For a VPS, let the provisioning script create `.env` with generated secrets:

```bash
sudo bash scripts/provision-staging.sh --app-dir "$PWD" --app-user "$USER" --hostname chat.example.com
```

For a local Mac smoke file, print a generated `.env` and redirect it:

```bash
bash scripts/provision-staging.sh --print-env --hostname localhost --phx-port 4300 --http-port 8300 --https-port 8443 --tls-snippet local_tls > .env
```

Store the generated secrets in a password manager. Do not commit `.env`.

The script generates the required values below with `openssl rand`.

### `SECRET_KEY_BASE`

Signs Phoenix cookies and session data. Rotating it signs everyone out.

Generated as 64 random bytes encoded with base64.

### `TOKEN_SIGNING_SECRET`

Signs authentication tokens. Use a different value from `SECRET_KEY_BASE`.

Generated as 64 random bytes encoded with base64.

### `CLOAK_KEY`

Encrypts server-side secrets at rest. It must be base64 for 32 raw bytes.

Generated as 32 random bytes encoded with base64.

### `ATTACHMENT_SIGNING_SECRET`

Signs attachment download URLs. Use a different value from the other secrets.

Generated as 48 random bytes encoded with base64.

### `POSTGRES_PASSWORD`

Password for the bundled Postgres container.

Generated as 32 random bytes encoded with base64.

### `UPLOADS_DIR`

Absolute path inside the Phoenix container where uploaded files are stored. The compose file mounts a named Docker volume at this path.

```bash
printf '%s\n' '/data/uploads'
```

### `PHX_HOST`

Public hostname without a scheme and without a port.

```bash
printf '%s\n' 'chat.example.com'
```

For a local Mac test, use:

```bash
printf '%s\n' 'localhost'
```

### Postgres components

Phoenix derives its database connection from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, and `POSTGRES_PORT`.
For the bundled compose Postgres service, keep the host as `postgres` and the
port as `5432`.

`DATABASE_URL` is only needed when using managed or external Postgres. If you
set it, uncomment the matching passthrough in `docker-compose.yml`.

### Fill `.env`

Edit `.env` if you need to change the hostname or ports:

```bash
nano .env
```

For a public VPS, set:

```bash
PHX_HOST=chat.example.com
HTTP_PORT=80
HTTPS_PORT=443
CADDY_TLS_SNIPPET=public_tls
SECRET_KEY_BASE=paste-generated-value
TOKEN_SIGNING_SECRET=paste-generated-value
CLOAK_KEY=paste-generated-value
ATTACHMENT_SIGNING_SECRET=paste-generated-value
UPLOADS_DIR=/data/uploads
POSTGRES_USER=yawp
POSTGRES_PASSWORD=paste-generated-value
POSTGRES_DB=yawp_prod
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

Leave `PHX_PORT` unset on a public VPS. The compose stack binds Phoenix to
loopback only when `PHX_PORT` is set. Caddy is the public HTTP and HTTPS
entrypoint. For staging, use the staging compose overlay so Phoenix has no host
published port at all:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
```

For a local Mac test, set:

```bash
PHX_HOST=localhost
PHX_PORT=4300
HTTP_PORT=8300
HTTPS_PORT=8443
CADDY_TLS_SNIPPET=local_tls
SECRET_KEY_BASE=paste-generated-value
TOKEN_SIGNING_SECRET=paste-generated-value
CLOAK_KEY=paste-generated-value
ATTACHMENT_SIGNING_SECRET=paste-generated-value
UPLOADS_DIR=/data/uploads
POSTGRES_USER=yawp
POSTGRES_PASSWORD=paste-generated-value
POSTGRES_DB=yawp_prod
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

Optional image pin:

```bash
YAWP_IMAGE=ghcr.io/siricard/yawp:v0.1.0
```

Leave `YAWP_IMAGE` unset to use the default published image.

## Bring-up

The bootstrap script already starts the stack. To do the last step yourself, pull the published image and start:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml pull
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
docker compose -f docker-compose.yml -f docker-compose.staging.yml ps
```

If the pull is denied or the image is unavailable, build on the VPS:

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build --wait
docker compose -f docker-compose.yml -f docker-compose.staging.yml ps
```

Check the health and version endpoints. On a public VPS:

```bash
curl -fsS https://chat.example.com/health
curl -fsS https://chat.example.com/version
```

On a local Mac test:

```bash
curl -fsSk https://localhost:8443/health
curl -fsSk https://localhost:8443/version
```

## Publishing the image

Repository maintainers can publish `ghcr.io/siricard/yawp:latest` from GitHub:

1. Open the repository on GitHub.
2. Go to **Actions**.
3. Select **Publish image**.
4. Click **Run workflow**.

The workflow builds the Docker image and pushes both `latest` and the commit SHA tag. It does not deploy to any server.

GitHub Container Registry packages start private, even for public repositories. After the first publish, make the package public once so servers can pull anonymously:

1. Open the GitHub package page for `yawp`.
2. Go to **Package settings**.
3. Under visibility, choose **Change visibility**.
4. Select **Public** and confirm.

If you keep the package private, log in to GHCR on each server before `docker compose pull`:

```bash
printf '%s\n' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
```

Find the first-boot setup URL in the Phoenix logs:

```bash
docker compose logs phoenix | grep -E '/admin/setup\?token='
```

Open that URL in your browser. Create the first operator account with your email and a strong password. After the account exists, the setup URL cannot be reused.

To claim the server as the chat owner:

1. Sign in at `/admin`.
2. Open the chat-owner management section.
3. Generate a claim token.
4. Open the Yawp client.
5. Add the server URL, for example `https://chat.example.com`.
6. Paste the claim token.
7. Complete the claim flow.

## TLS with Caddy and Let's Encrypt

The compose stack includes Caddy. For a public VPS, set:

```bash
PHX_HOST=chat.example.com
CADDY_TLS_SNIPPET=public_tls
HTTP_PORT=80
HTTPS_PORT=443
```

Caddy will request and renew Let's Encrypt certificates automatically. Before starting the stack, DNS must already point `chat.example.com` at the VPS, and ports 80 and 443 must be reachable from the internet.

Firewall guidance for Ubuntu with UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 4000/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not publish port 4000 directly to the internet. Caddy should be the only public HTTP entrypoint. Port 4000 is the private container port Caddy uses to reach Phoenix inside the compose network.

## Staging and multiple anchors

To run two anchors for federation testing, use two VPSes and two hostnames:

- `anchor-a.staging.example`
- `anchor-b.staging.example`

Create DNS records before booting:

```bash
dig +short anchor-a.staging.example A
dig +short anchor-b.staging.example A
```

On the first VPS, repeat the same setup with a `.env` whose `PHX_HOST` is `anchor-a.staging.example`:

```bash
sudo bash scripts/provision-staging.sh --dry-run --app-dir "$PWD" --app-user "$USER" --hostname anchor-a.staging.example
sudo bash scripts/provision-staging.sh --app-dir "$PWD" --app-user "$USER" --hostname anchor-a.staging.example
docker compose -f docker-compose.yml -f docker-compose.staging.yml pull
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
docker compose logs phoenix | grep -E '/admin/setup\?token='
```

On the second VPS, use a separate `.env` whose `PHX_HOST` is `anchor-b.staging.example` and separate generated secrets:

```bash
sudo bash scripts/provision-staging.sh --dry-run --app-dir "$PWD" --app-user "$USER" --hostname anchor-b.staging.example
sudo bash scripts/provision-staging.sh --app-dir "$PWD" --app-user "$USER" --hostname anchor-b.staging.example
docker compose -f docker-compose.yml -f docker-compose.staging.yml pull
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
docker compose logs phoenix | grep -E '/admin/setup\?token='
```

Claim each server from its own setup URL and operator account. Keep the `.env` files separate. Do not copy secrets from one anchor to the other.

### Seed a staging anchor remotely

After creating the operator account, sign in to `/admin` and generate a chat-owner claim token. Use that token from your laptop or from the VPS checkout:

```bash
node scripts/staging-seed.mjs \
  --base-url https://anchor-a.staging.example \
  --claim-token paste-claim-token-here \
  --output anchor-a-seed.json
```

The seed command talks only to the public HTTPS and RPC surfaces. It claims the chat owner, binds devices for two generated identities, mints and redeems a room invite, verifies the default text channel through RPC, sends a two-message direct-message exchange, and writes the generated identity/session artifact to the output file. Store the artifact somewhere private if you want to reuse the seeded browser sessions for manual testing.

Repeat with `https://anchor-b.staging.example` and that anchor's own fresh claim token when you need both anchors populated.

To reset a staging anchor to a clean state, destroy only that host's compose volumes and start again:

```bash
docker compose down -v
docker compose -f docker-compose.yml -f docker-compose.staging.yml pull
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --wait
docker compose logs phoenix | grep -E '/admin/setup\?token='
```

Then create the operator account again, generate a new chat-owner claim token, and re-run `node scripts/staging-seed.mjs --base-url https://anchor-a.staging.example --claim-token paste-claim-token-here --output anchor-a-seed.json`. The old seed artifact is no longer valid after `down -v`.

## Operations

### Pin the image

Pin to a specific image tag in `.env`:

```bash
YAWP_IMAGE=ghcr.io/siricard/yawp:v0.1.0
```

Apply the pin:

```bash
docker compose pull
docker compose up -d --wait
docker compose ps
```

### Upgrade

If `YAWP_IMAGE` is pinned, edit `.env` and change it to the new tag. Then run:

```bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 phoenix
```

Database migrations run automatically before Phoenix starts.

### Back up Postgres

Create a compressed database dump:

```bash
mkdir -p backups
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-yawp}" -d "${POSTGRES_DB:-yawp_prod}" --format=custom > "backups/yawp-postgres-$(date +%Y%m%d-%H%M%S).dump"
```

### Back up uploads

Archive the uploads volume:

```bash
mkdir -p backups
docker run --rm -v yawp_uploads_data:/data:ro -v "$PWD/backups:/backup" alpine tar -czf "/backup/yawp-uploads-$(date +%Y%m%d-%H%M%S).tgz" -C /data .
```

If you use a compose project name other than `yawp`, list volumes first and replace `yawp_uploads_data` with the actual uploads volume name:

```bash
docker volume ls | grep uploads
```

### Restore Postgres

Stop Phoenix, restore the dump, then start the stack:

```bash
docker compose stop phoenix
docker compose exec -T postgres dropdb -U "${POSTGRES_USER:-yawp}" --if-exists "${POSTGRES_DB:-yawp_prod}"
docker compose exec -T postgres createdb -U "${POSTGRES_USER:-yawp}" "${POSTGRES_DB:-yawp_prod}"
docker compose exec -T postgres pg_restore -U "${POSTGRES_USER:-yawp}" -d "${POSTGRES_DB:-yawp_prod}" --clean --if-exists < backups/yawp-postgres.dump
docker compose up -d --wait
```

### Restore uploads

Restore the uploads archive into the uploads volume:

```bash
docker compose stop phoenix
docker run --rm -v yawp_uploads_data:/data -v "$PWD/backups:/backup" alpine sh -c 'rm -rf /data/* && tar -xzf /backup/yawp-uploads.tgz -C /data'
docker compose up -d --wait
```

If your volume name is different, replace `yawp_uploads_data` with the value from:

```bash
docker volume ls | grep uploads
```

### Reset

This destroys the database, uploads, and Caddy data for the current compose project:

```bash
docker compose down -v
docker compose up -d --wait
docker compose logs phoenix | grep -E '/admin/setup\?token='
```

Use reset only for a new test server or a recovery drill where you have verified backups.

### Teardown

To stop containers without deleting data:

```bash
docker compose down
```

To stop containers and delete all local data:

```bash
docker compose down -v
```
