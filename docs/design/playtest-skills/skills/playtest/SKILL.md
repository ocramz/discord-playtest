---
name: playtest
description: The Playtest compatibility contract for JS/TS browser games. Playtest is a Discord Activity that plays, pauses, steps and rewinds games and replays player feedback deterministically. Use this skill whenever a repository contains playtest.json or imports @playtest/kit, whenever the user mentions Playtest, playtesting on Discord, deterministic replay, rewind/step debugging, conformance tiers or readiness-report codes (PT001–PT022), and whenever you write or change game code (Phaser, three.js, PixiJS, Babylon.js, canvas) in such a repository, even if the request doesn't mention Playtest.
compatibility: Targets manifest schema v1 and @playtest/cli 0.1 (stub).
---

# Playtest compatibility contract

> Stub. Rules are stable; items marked `TODO(api)` / `TODO(cli)` await the `@playtest/kit` and `@playtest/cli` releases.

## How the harness sees a game

Playtest runs the game in a sandboxed iframe inside Discord and **owns the game loop**. It also virtualizes time, randomness, input, storage and network:

- **One tick** means: advance virtual time by `1000 / tickRate` ms, fire due timers, then run queued `requestAnimationFrame` callbacks once.
- **A frame** is addressed by (build, seed, input log, tick number).
- **Why determinism matters.** Players attach feedback to frames, and later builds are retested by replaying the same inputs. A game that isn't deterministic can still be played, but its feedback can't be replayed.

So the goal of compatibility work is not "make it run"; it usually runs already. The goal is **"make the same inputs produce the same states"**, and then make that state observable (`describe()`) and cheap to restore (snapshots, pure ticks).

## Before changing code

1. Read `playtest.json`. The schema is in `references/manifest.md`.
2. Run `npx playtest check --json` and note `effectiveTier`, `determinism.status` and `findings`.
3. Identify the framework from `package.json`, and read the matching reference:

| Dependency | Reference |
|---|---|
| `phaser` | `references/phaser.md` |
| `three` | `references/threejs.md` |
| `pixi.js` | `references/pixi.md` |
| `@babylonjs/core`, `babylonjs` | `references/babylon.md` |
| none / `excalibur` / `kaplay` / `littlejsengine` / raw canvas or WebGL | `references/canvas-and-others.md` |
| `@dimforge/rapier*`, `matter-js`, `cannon-es`, Arcade/Matter in Phaser | also `references/physics.md` |

## Rules for every tier

Each rule exists because of how Discord's sandbox or deterministic replay works. Finding codes are listed in `references/findings.md`.

- **Ship everything in the build.** Discord's CSP only allows the app's own proxy, so CDNs, remote fonts and analytics scripts fail (PT001).
- **No `eval`, `new Function`, string timers, or `blob:`/`data:` scripts or workers.** CSP blocks them (PT002, PT003).
- **No Web Workers, `SharedArrayBuffer` or `Atomics`.** Parallelism isn't replayable (PT004). Use single-threaded wasm builds (PT021).
- **No network beyond the game's own assets.** The sandbox has none (PT005). Mock backends, or add an offline mode.
- **Declare every input in `input.buttons` / `input.axes` / `input.pointer`.** The harness replays inputs from the manifest; undeclared keys never reach the game (PT019).
- **Don't drive game logic from audio timing** (`ended`, `currentTime`) (PT008).
- **Use total, deterministic `sort` comparators** (PT009). Avoid `WeakRef` / `FinalizationRegistry` in game logic (PT010) and locale-dependent formatting (`Intl`, `toLocaleString`) in simulation.

Things you **don't** need to work around, because the harness virtualizes them: `Date`, `performance.now`, `requestAnimationFrame`, timers, `Math.random`, `crypto.getRandomValues`, `localStorage`/`indexedDB` (in-memory), focus/visibility events, pointer lock and fullscreen requests. Never add code that bypasses these, for example by caching a real `Date` before the game starts.

## Tiers

| Tier | Game provides | You get |
|---|---|---|
| 0 Recorded | Nothing (fallback when not deterministic) | Screenshot/clip feedback only |
| 1 Hosted | `playtest.json` + adapter | Play/pause/step, reproducible frames, CI retests; rewind re-simulates from frame 0 |
| 2 Snapshot | Tier 1 + `snapshot()` / `restore()` | Instant rewind and seek |
| 3 Pure | `init` / `tick` / `render` module | Node replays in CI, fast AI validation, edit-and-continue |

At any tier, also export `describe()`: a small JSON view of the state players reason about. It powers checkpoints, expectations and AI context. The exact contracts and code shapes are in `references/tiers.md`.

## Determinism levels

- **`local`:** same JS engine family (e.g. desktop Chromium to Chromium). This is enough for most games.
- **`strict`:** across engines (desktop ↔ iOS). It additionally requires `@playtest/kit/math` instead of `Math.sin/cos/tan/atan2/exp/log/pow` in simulation code (PT007), and engine-independent physics (`references/physics.md`).

## Verify, always

Run `npx playtest check --json` after every meaningful change. A change is done when:

- there are no `error` findings;
- `effectiveTier >= target`;
- `determinism.status === "verified"`.

Explain any remaining warnings to the user rather than suppressing them.

## Don't

- Don't edit the harness runtime, the adapter or the CSP.
- Don't add network calls.
- Don't silence findings with lint-disable comments.
- Don't edit `.github/workflows/`, except the Playtest workflow during onboarding with approval.
- Don't change gameplay while doing compatibility work, unless the user asks.
