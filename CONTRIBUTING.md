# Contributing to Yawp

Thanks for your interest in contributing to Yawp. This document explains the
contribution flow, which parts of the repository accept external contributions,
and the legal sign-offs that must accompany every PR to the core.

Before contributing, please read our [Code of Conduct](CODE_OF_CONDUCT.md). By
participating in this project you agree to abide by its terms.

## Repository layout

Yawp is an Elixir Mix umbrella with two app trees, each under its own license:

| Path                  | License                            | External contributions? |
| --------------------- | ---------------------------------- | ----------------------- |
| `apps/yawp/`          | AGPL-3.0                           | **Yes** — see below.    |
| `apps/yawp_premium/`  | Proprietary — all rights reserved  | **No.** PRs touching this directory will be closed without review. |

See [`LICENSE`](LICENSE) for the full licensing summary and the per-tree
license files for the authoritative legal text.

## Contribution flow (core — `apps/yawp/`)

1. **Fork** the repository on GitHub.
2. **Create a branch** off `main` with a short, descriptive name
   (e.g. `feat/message-search`, `fix/channel-replay`).
3. **Make your change.** Keep PRs focused; one logical change per PR.
4. **Sign every commit** with a `Signed-off-by` line (DCO) — see below.
5. **Open a PR** against `main`. On your first PR, the CLA Assistant bot will
   comment with a link to sign the Contributor License Agreement.
6. **Sign the CLA** by clicking the link in the bot's comment. The bot will
   re-check your PR automatically once you've signed.
7. **Address review feedback** and keep the branch rebased on `main`.

### Developer Certificate of Origin (DCO) — required

Every commit to `apps/yawp/` must carry a `Signed-off-by` trailer attesting
that you have the right to submit the change under the project's license. Use
`git commit -s` to add the trailer automatically:

```bash
git commit -s -m "Add message search to room view"
```

This appends a line like:

```
Signed-off-by: Your Name <you@example.com>
```

The DCO sign-off is **required even after you have signed the CLA**. The CLA
covers the legal grant; the DCO is the per-commit attestation.

### Contributor License Agreement (CLA) — required for `apps/yawp/`

Because `apps/yawp/` is AGPL-3.0 and we want to keep the option of relicensing
or dual-licensing in the future, all external contributors to the core must
sign a Contributor License Agreement. The CLA text lives at
[`.github/CLA.md`](.github/CLA.md).

The CLA Assistant GitHub App will post a sign-off URL as a comment on your
first PR. Signing is a one-time action that covers all your future PRs to this
repository. You do **not** need to re-sign for each PR.

If the CLA Assistant bot does not comment on your PR, please open an issue —
the repository owner may need to (re-)install the
[CLA Assistant GitHub App](https://github.com/apps/cla-assistant) on the
repository.

## Contributions to `apps/yawp_premium/`

The premium tier is proprietary and **does not accept external contributions**.
PRs touching files under `apps/yawp_premium/` will be closed without review.
If you have a feature idea that you believe belongs in the premium tier,
please open an issue to discuss it instead.

## Development setup

The repository uses a Nix flake to pin all toolchain versions. With direnv
installed, entering the repository directory activates the dev shell
automatically. Without direnv:

```bash
nix develop          # interactive shell
nix develop -c <cmd> # one-off command
```

Common commands:

```bash
nix develop -c mix test       # run the Elixir test suite
nix develop -c just dev       # boot the Phoenix dev server on :4000
nix develop -c just rn-metro  # start the React Native Metro bundler
```

See [`AGENTS.md`](AGENTS.md) and [`README.md`](README.md) for more detail.

## GitHub-side setup (repository owner)

Some pieces of the contribution workflow rely on a GitHub App being installed
on the repository. These are **one-time owner actions** — contributors do not
need to perform them, but they must be in place for the contributor flow
above to work end to end:

1. Install the [CLA Assistant GitHub App](https://github.com/apps/cla-assistant)
   on the `yawp` repository.
2. Grant the app access to `.github/CLA.md` and `.github/cla-signatures.json`
   so it can read the CLA text and record signatures.
3. Confirm the workflow `.github/workflows/cla.yml` is enabled in
   **Settings → Actions**.

Once these are in place, the CLA Assistant bot will automatically comment on
every new external PR with a sign-off link, and the workflow will block merge
until the contributor signs.

## Reporting security issues

Do **not** open a public GitHub issue for security vulnerabilities. See
[`SECURITY.md`](SECURITY.md) for the responsible disclosure policy.
