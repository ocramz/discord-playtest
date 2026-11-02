---
name: playtest-new-game
description: Start a new JS/TS browser game that is Playtest-ready from the first commit, with a deterministic Tier 3 structure (pure init/tick/render), playtest.json and the CI workflow, then keep it compatible while adding features. Use whenever the user wants to create, scaffold or prototype a new game (game jam, new project, "make me a small platformer") in Phaser, three.js, PixiJS, Babylon.js or plain canvas and mentions Playtest or Discord playtesting, or the repository already contains playtest.json but no game yet.
compatibility: Requires Node 20+ and @playtest/cli 0.1 (stub). Pairs with the `playtest` skill.
---

# Start a Playtest-ready game

> Stub. A game structured this way from day one gets every Playtest feature: instant rewind, Node replays in CI, edit-and-continue and fast AI fixes. It also avoids a costly refactor later.

## 1. Pick the stack

| Framework | Recommended tier | Why |
|---|---|---|
| Plain canvas / WebGL | 3 | Nothing owns the loop; simplest pure structure |
| PixiJS v8 | 3 | Pixi as renderer, state in plain data |
| three.js | 3 | three.js as renderer, state in plain data; Rapier `-deterministic` for physics |
| Phaser | 2 | Phaser owns the loop and scene graph; model + snapshot hooks |
| Babylon.js | 1–2 | Fixed-step lockstep; keep the logic in plain modules |

If the user has no preference, suggest PixiJS (2D) or three.js (3D) at Tier 3.

## 2. Scaffold

```bash
npx @playtest/cli create my-game --template <canvas|pixi|three|phaser|babylon>
```

This writes the project, `playtest.json`, `.github/workflows/playtest.yml` and an `npm run dev` script that runs `playtest dev`. Without the CLI, start from `assets/tier3-skeleton.ts` and copy the manifest and workflow templates from the `playtest-onboard` skill.

## 3. Structure (Tier 3)

```text
src/
  sim/        # pure simulation: state types, tick(), rules — no DOM, timers, network, storage
  view/       # rendering only: reads state, never writes it
  main.ts     # export default defineGame({ init, tick, render, describe })
playtest.json
.playtest/runs/   # optional golden runs (.ptil) replayed by `playtest check`  TODO(cli)
```

## 4. Rules while adding features

- **Gameplay goes in `sim/`** and changes state only inside `tick`.
- **Read input only from the `InputFrame`.** Add each new control to `playtest.json` `input.buttons` first.
- **Randomness comes from `ctx.rng` and time from `ctx.tick * ctx.dt`.** Never read `Date`/`performance` in `sim/`.
- **Physics:** step exactly once per tick.
- **`describe()` grows with the game.** Expose what players would mention in a bug report.
- **Bundle assets** under `public/`; never load from CDNs.
- **After each feature,** run `npx playtest check --json` and keep it free of errors.
- **Optionally record a golden run** of a feature in `playtest dev` and commit it, so CI catches regressions. `TODO(cli)`: `playtest dev` "Save as golden run".

## 5. Before the first push

- `npx playtest check` passes at Tier 3 and determinism is `verified`.
- Remind the user to run `/playtest link` in their Discord server after pushing (see the `playtest-onboard` skill, step 6).
