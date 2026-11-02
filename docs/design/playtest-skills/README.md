# Playtest agent skills (stubs)

These skills teach coding agents how to make JS/TS games compatible with **Playtest**, a Discord Activity where players play builds, rewind to exact frames and leave replayable feedback. The skills follow the design document's §6 (game runtime), §7 (builds) and §20 (author onboarding).

> **Status: stubs.** The structure, triggers and core rules are final for v0.1. Lines marked `TODO(cli)` or `TODO(api)` depend on `@playtest/cli` / `@playtest/kit` details that aren't implemented yet.

## Skills

| Skill | Use it to |
|---|---|
| `skills/playtest` | Learn the compatibility contract: runtime rules, manifest, tiers, finding codes and framework specifics. The other skills build on it |
| `skills/playtest-onboard` | Add Playtest to an existing game (manifest + CI workflow + first check) |
| `skills/playtest-new-game` | Start a new game that's Playtest-ready (Tier 3 structure) |
| `skills/playtest-tier-up` | Move a game up one tier (`describe()` → snapshots → pure tick) |
| `skills/playtest-determinism-debug` | Find and fix replay divergence (PT006–PT013, cross-device drift) |

Frameworks covered: Phaser 3.60+/4, three.js, PixiJS v8, Babylon.js, and plain canvas or other JS engines (Excalibur, KAPLAY, LittleJS).

## Install

- **Into a repository:** `npx @playtest/cli skills install` copies `skills/*` into `.claude/skills/` (or `--target <dir>`). `TODO(cli)`
- **Claude Code plugin:** this folder is a plugin (`.claude-plugin/plugin.json` + `skills/`).
- **claude.ai / API:** upload the packaged files in `dist/*.skill`, one per skill.

## Conventions shared by all skills

1. Read `playtest.json` and the latest readiness report (`npx playtest check --json`) before editing.
2. Make the smallest change that resolves a finding or reaches the next tier.
3. Re-run `playtest check` and finish only when it passes, or when the remaining findings are explained to the user.
4. Never weaken the CSP, add network access, or edit `.github/workflows/` (except adding the Playtest workflow during onboarding, with the user's approval).

## Next steps for maintainers of this pack

- Fill the `TODO(api)` code samples once `@playtest/kit` exports are final.
- Add `evals/` test cases per skill (see design doc §20.8): onboard a Vite + PixiJS repo, take a Phaser platformer to Tier 2, fix PT013 in a three.js + Rapier game.
