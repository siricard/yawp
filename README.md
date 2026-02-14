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

## Learn more

* Official website: https://www.phoenixframework.org/
* Guides: https://hexdocs.pm/phoenix/overview.html
* Docs: https://hexdocs.pm/phoenix
* Forum: https://elixirforum.com/c/phoenix-forum
* Source: https://github.com/phoenixframework/phoenix
