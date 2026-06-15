# Yawp Docs

The Yawp documentation site — self-hosting guides and concept documentation.
Built with [Astro Starlight](https://starlight.astro.build/) and run with Deno
(matching the toolchain of the marketing site).

It lives **in the code repo on purpose**: the concept pages are generated from
`../docs/adr/` and `../CONTEXT.md` at build time, so a single PR can change an
ADR and its rendered page together. Source of truth stays in `/docs` and
`/CONTEXT.md` — never hand-edit the generated pages.

## Develop

```sh
mise install          # deno 2.8.1, per mise.toml
deno task dev         # syncs ../docs, then starts the dev server
```

Other tasks: `deno task build`, `deno task preview`, `deno task check`.
`deno task sync` regenerates the pages pulled from the code repo.

## Layout

```
docs-site/
├── astro.config.mjs          # Starlight config + sidebar (the IA)
├── deno.json                 # tasks (mirror of yawp-site)
├── scripts/sync-docs.mjs     # pulls ../docs + ../CONTEXT.md → generated pages
└── src/
    ├── content/docs/         # the documentation pages
    │   ├── start-here/
    │   ├── self-hosting/      # operator journey
    │   ├── how-it-works/      # layered concept docs
    │   ├── reference/         # glossary + ADRs are generated here
    │   └── contributing/
    └── styles/custom.css      # Geist brand fonts
```

Generated paths (`src/content/docs/reference/adr/` and
`src/content/docs/reference/_generated/`) are git-ignored — regenerate them
with `deno task sync`.

## Deploy

Point your static host (Cloudflare Pages / Netlify / Vercel) at this
subdirectory:

- Build command: `deno task build`
- Output directory: `dist/`

This is a separate deploy from the marketing site and from the Elixir app.
