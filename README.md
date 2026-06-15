> [!CAUTION]
> This a WIP. This isn't beta, this isn't alpha, this doesn't even exist yet.

# Yawp

## Try it

```bash
just demo
```

`just demo` resets the dev database, boots Phoenix, and points you at the
single rolling walkthrough — [`docs/walkthroughs/latest.md`](docs/walkthroughs/latest.md).
It scripts the full end-to-end path: operator setup → chat-owner claim →
mnemonic onboarding/restore → a second identity redeems a server invite and
joins `#general` → real-time messaging between two browser sessions. Every
surface is skinned against the shared design system, and web + native render
from the same tokens.

To browse the shared component library in isolation:

```bash
just ladle
```

Then open [`http://localhost:61000`](http://localhost:61000).

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

Native distribution notes for TestFlight and the Play internal testing track live in [`apps/yawp/assets/native/RELEASING.md`](apps/yawp/assets/native/RELEASING.md).

## Self-hosting

The self-hosting guide lives in [`docs/self-hosting.md`](docs/self-hosting.md).
It covers VPS sizing, DNS, Docker Engine and Compose v2, environment
configuration, Caddy TLS, first-boot setup, upgrades, backups, restore, reset,
and running a second anchor for federation testing.

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
