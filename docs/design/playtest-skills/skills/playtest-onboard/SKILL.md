---
name: playtest-onboard
description: Onboard an existing JS/TS browser game to Playtest (Discord playtesting with deterministic replay). It detects the framework, writes playtest.json and the GitHub Actions workflow, runs `playtest check` and fixes blocking findings until the game reaches Tier 1. Use whenever the user wants to add a game to Playtest, set up Discord playtesting, create or repair playtest.json, or when a readiness report shows PT020, PT001–PT005, PT019 or PT021, even if they just say "make this work with the Discord playtest thing".
compatibility: Requires Node 20+ and @playtest/cli 0.1 (stub). Pairs with the `playtest` skill for framework details.
---

# Onboard a game to Playtest

> Stub. Target outcome: a repository with `playtest.json` and `.github/workflows/playtest.yml` whose `playtest check` reports no errors at Tier 1.

## 1. Preflight

Confirm, and ask the user if anything is unclear:

- The repository is public on GitHub and the user can merge to the default branch. Playtest's GitHub App requires admin or maintain rights.
- The game builds to a web page (an `index.html` plus a JS/TS entry).
- The framework, from `package.json`: `phaser`, `three`, `pixi.js`, `@babylonjs/core`, or none.

## 2. Generate the files

Preferred:

```bash
npx @playtest/cli init            # interactive; use --yes --framework <name> for non-interactive runs
```

If the CLI isn't available, write the files by hand:

- `playtest.json`: start from `assets/playtest.example.json` and the field rules in the `playtest` skill (`references/manifest.md`).
- The workflow: copy `assets/playtest.yml` to `.github/workflows/playtest.yml`. **Ask the user before writing anything in `.github/workflows/`.** Explain that it only needs `contents: read` and `id-token: write`, and no secrets.

## 3. Review the manifest with the user

Check these, because detection can be wrong:

- **`entry`:** the module that boots the game.
- **`adapter`:** matches the framework.
- **`viewport`:** the game's logical resolution.
- **`input`:** search the source for every key, pointer and gamepad usage. Every key read anywhere must be in some button's list (PT019). Name buttons by action.
- **`determinism`:**
  - `local` by default;
  - `strict` only if the user needs cross-device replays (desktop ↔ iOS) and the physics engine supports it.
- **`tier`:** start at `1`.

## 4. Check and fix

```bash
npx playtest check --json
```

Fix every `error`, using the `playtest` skill's `references/findings.md`. The usual onboarding blockers are:

| Finding | Typical fix |
|---|---|
| PT001 | Vendor CDN scripts, fonts and images into the repository |
| PT002 / PT003 | Remove `eval`/`blob:` usage, or switch the library to its CSP-safe mode |
| PT005 | Put backend calls behind an offline/mock flag that the playable build uses |
| PT020 | Fix `entry`, or re-run `init` |
| PT021 | Switch to a single-threaded wasm build |

Re-run until there are no errors. Explain each remaining warning to the user, with a one-line consequence.

## 5. Try it locally (optional)

```bash
npx playtest dev     # same sandbox, CSP and harness as production; play/pause/step/rewind
```

## 6. Hand-off

Summarize for the user in this format:

```text
Playtest onboarding: <repo>
- Files: playtest.json (adapter <x>, tier 1, determinism <local|strict>), .github/workflows/playtest.yml
- playtest check: <n> errors, <n> warnings (<codes>)
- Next in Discord: /playtest link repo:<owner/repo> (if not done), merge, wait for the first CI readiness report
- Suggested next step: add describe() (skill: playtest-tier-up)
```

`TODO(cli)`: once `--fix` autofixes exist (PT019 manifest additions, PT001 vendoring), prefer them over manual edits.
