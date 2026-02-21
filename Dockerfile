# syntax=docker/dockerfile:1.7

# --- Build stage --------------------------------------------------------------
# Elixir 1.19.5 + Erlang/OTP 28 on Debian bookworm (matches the Nix dev shell).
# Pulls Node 22 alongside so we can run the esbuild/tailwind asset pipeline
# inside the same stage.
ARG ELIXIR_VERSION=1.19.5
ARG ERLANG_VERSION=28.2
ARG DEBIAN_RELEASE=bookworm-20260202
ARG NODE_MAJOR=22

FROM hexpm/elixir:${ELIXIR_VERSION}-erlang-${ERLANG_VERSION}-debian-${DEBIAN_RELEASE}-slim AS builder

ARG NODE_MAJOR
ARG MIX_ENV=prod
# Build provenance — pass via `--build-arg` from CI (release.yml fills these
# from the git tag, the resolved commit SHA, and the build start time). They
# are baked into the runtime stage as ENV so the OTP release sees them at
# boot (config/runtime.exs → :yawp, :build_info → /version controller).
ARG YAWP_VERSION=unknown
ARG YAWP_COMMIT=unknown
ARG YAWP_BUILT_AT=unknown
ENV MIX_ENV=${MIX_ENV} \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# OS deps:
#   build-essential + git → Hex/native deps (bcrypt_elixir, picosat_elixir, ...)
#   ca-certificates + curl → fetch the NodeSource repo + Hex over HTTPS
#   gnupg → verify the NodeSource repo signing key
#   pkg-config + libssl-dev + libsrtp2-dev → ex_webrtc's native NIFs
#     (ex_dtls / ex_libsrtp via Bundlex pkg-config provider)
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      git \
      gnupg \
      libsrtp2-dev \
      libssl-dev \
      pkg-config \
 && curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Mix Hex + rebar3 — pinned, non-interactive.
RUN mix local.hex --force \
 && mix local.rebar --force

# 1. Deps caching layer. Copy lockfile + every umbrella app's mix.exs first so
#    `mix deps.get` is cacheable independent of source churn.
COPY mix.exs mix.lock ./
COPY apps/yawp/mix.exs apps/yawp/
COPY apps/yawp_premium/mix.exs apps/yawp_premium/
COPY config/config.exs config/${MIX_ENV}.exs config/

RUN mix deps.get --only ${MIX_ENV} \
 && mix deps.compile

# 2. JS asset deps. The web bundle is built from apps/yawp/assets and
#    references Phoenix JS via `file:../../../deps/<pkg>` — those paths
#    resolve into /app/deps populated by `mix deps.get` above.
#
#    `npm install` (not `npm ci`) because the host lock file references the
#    pre-umbrella layout; the file: links are reproducible regardless.
COPY apps/yawp/assets/package.json apps/yawp/assets/package-lock.json apps/yawp/assets/
RUN cd apps/yawp/assets && npm install --no-audit --no-fund --omit=optional

# 3. Application source. Native (RN iOS/Android/macOS) is excluded via
#    .dockerignore — it bloats the context with no benefit to the server build.
COPY apps/ apps/
COPY config/ config/
COPY rel/ rel/

# 4. Build static assets (tailwind + esbuild + phx.digest) then the OTP release.
RUN mix assets.deploy \
 && mix compile \
 && mix release yawp

# --- Runtime stage ------------------------------------------------------------
# Minimal Debian slim with only what BEAM + OpenSSL need at runtime. ERTS is
# bundled into the release, so no Erlang install is required here.
FROM debian:bookworm-slim AS runtime

ARG YAWP_VERSION=unknown
ARG YAWP_COMMIT=unknown
ARG YAWP_BUILT_AT=unknown

ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    MIX_ENV=prod \
    PHX_SERVER=true \
    HOME=/app \
    YAWP_VERSION=${YAWP_VERSION} \
    YAWP_COMMIT=${YAWP_COMMIT} \
    YAWP_BUILT_AT=${YAWP_BUILT_AT}

RUN apt-get update -y \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      libsrtp2-1 \
      libstdc++6 \
      libncurses6 \
      libssl3 \
      locales \
      openssl \
      tini \
 && sed -i '/en_US.UTF-8/s/^# //' /etc/locale.gen \
 && locale-gen \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Non-root runtime user.
RUN groupadd --system --gid 1000 yawp \
 && useradd --system --uid 1000 --gid yawp --home /app --shell /usr/sbin/nologin yawp \
 && chown -R yawp:yawp /app

COPY --from=builder --chown=yawp:yawp /app/_build/prod/rel/yawp ./

USER yawp

EXPOSE 4000

# Health probe used by docker-compose. The Phoenix root route always responds
# 200 once the endpoint is up — no auth or database round-trip required.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=12 \
  CMD curl -fsS http://127.0.0.1:4000/ || exit 1

# tini reaps zombies and forwards signals to the release script so
# `docker stop` triggers a clean BEAM shutdown.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/bin/server"]
