---
name: playtest-tier-up
description: Move a Playtest game up one conformance tier safely, by adding describe() (Tier 1+), snapshot/restore hooks (Tier 2), or refactoring into a pure init/tick/render module (Tier 3), verifying with `playtest check` after each step. Use when the user wants faster rewind or seek, better or headless replays, expectations on feedback threads, AI-assisted fixes that need game state, CI retests in Node, or edit-and-continue, or when a readiness report suggests a next tier or shows PT015, PT011 or PT012.
compatibility: Requires @playtest/cli 0.1 (stub). Uses the `playtest` skill's references/tiers.md and framework references.
---

# Climb one tier

> Stub. Move **one step at a time**, keep the game playable after each step, and don't change gameplay.

## 0. Where are we?

```bash
npx playtest check --json     # read effectiveTier, findings, nextSteps
```

Pick the next step from the readiness report's `nextSteps`, or from this ladder: **A → B → C**.

## A. Add `describe()` (Tier 1 → 1+)

1. List 5–30 fields that players and bug reports refer to: positions, velocities, health, state-machine states, level, score, active-enemy counts.
2. Export them from the entry module with `definePlaytestHooks({ describe })`. The shape and rules are in the `playtest` skill, `references/tiers.md`.
3. Return plain JSON with stable key order and exact numbers. It must have no side effects.
4. **Verify:** `playtest check` no longer reports PT015, and checkpoints use `describe`.

## B. Add snapshots (Tier 1 → 2)

1. **Inventory all simulation state:** entities, physics world, gameplay timers and tweens, AI blackboards, spawners, level progress. RNG and clocks are handled by the adapter.
2. **Introduce a plain game model** if state lives only in framework objects (typical for Phaser and Babylon).
3. **Implement the hooks:**
   - `snapshot()` returns the model plus physics bytes (`world.takeSnapshot()` for Rapier);
   - `restore()` rebuilds the model and view objects from data.
4. **Round-trip test:** snapshot at tick N, restore, run M ticks, and compare with an uninterrupted run. `TODO(cli)`: `playtest check --tier 2` does this.
5. **Common misses:**
   - Phaser scene timers and tweens that affect gameplay;
   - entity ID counters;
   - object pools whose order matters;
   - physics handles that must be remapped after restore.

## C. Refactor to pure tick (→ Tier 3)

Use a strangler approach. Commit after each step, and run `playtest check` each time.

1. Define the `State` type, and move the authoritative data into it.
2. Create `tick(state, input, ctx)`, and move update logic into it system by system, starting with input handling and movement.
3. Replace DOM input listeners in game logic with `InputFrame` reads; add any missing buttons to the manifest.
4. Replace `Date`/`performance` with `ctx.tick * ctx.dt`, and real randomness with `ctx.rng` (PT006).
5. Turn the framework's update loop into `render(state, view)`, which syncs the view from state only (PT011).
6. Export `defineGame({ init, tick, render, describe })` and set `"tier": 3`.
7. **Verify:** no PT011/PT012, `playtest check --tier 3 --engine node` passes, and determinism is `verified`.

Framework-specific patterns are in the `playtest` skill: `references/phaser.md` (Tier 2 is the practical maximum), `threejs.md`, `pixi.md`, `babylon.md` and `canvas-and-others.md`.

## Report

```text
Tier step: <from> → <to> for <repo>
- Changes: <files>, <summary>
- playtest check: effective tier <n>, determinism <status>, findings <codes or none>
- Gameplay changes: none (or list, if the user asked)
```
