# Tier contracts

## Tier 1 (hosted): no code required

The adapter drives the framework's loop through virtualized `requestAnimationFrame` and timers. You can optionally export hooks from the entry module:

```ts
import { definePlaytestHooks } from "@playtest/kit";   // TODO(api): confirm export name

export const playtest = definePlaytestHooks({
  describe: () => ({ level: level.id, player: { x: hero.x, y: hero.y, hp: hero.hp, state: hero.state } }),
  ready: () => new Promise<void>((r) => scene.events.once("create", () => r())), // optional explicit loading barrier
});
```

How to write a good `describe()`:

- Return 5–30 fields that players and bug reports talk about: positions, health, state-machine states, level and wave, score, timers.
- Return plain JSON with stable key order and no class instances. Return exact numbers; the hash relies on them.
- Make it cheap, because it runs every `checkpointEvery` ticks.

## Tier 2 (snapshot): add `snapshot()` / `restore()`

```ts
export const playtest = definePlaytestHooks({
  describe,
  snapshot: () => ({ model: gameModel.toJSON(), physics: world.takeSnapshot() }),     // all simulation state
  restore: (s) => { gameModel.load(s.model); world = RAPIER.World.restoreSnapshot(s.physics); rebuildViewFrom(gameModel); },
});
```

- **Include everything the simulation reads:** entities, physics world, game timers, tween/timeline progress that affects gameplay, and AI state.
- **The adapter adds** RNG streams, the virtual clock and timers, framework clocks, and Phaser `RND.state()`.
- **Restore must rebuild render objects** from the model. It must never assume the previous scene graph still matches.
- **Round-trip test:** a snapshot, a restore, then N ticks must produce the same checkpoints as an uninterrupted run. `TODO(cli)`: `playtest check --tier 2` performs this test.

## Tier 3 (pure): `init` / `tick` / `render`

```ts
import { defineGame, type InputFrame, type TickContext } from "@playtest/kit";   // TODO(api)

type State = { player: { x: number; y: number; vy: number; onGround: boolean }; tick: number };

export default defineGame<State>({
  init: ({ seed, rng }) => ({ player: { x: 40, y: 200, vy: 0, onGround: true }, tick: 0 }),
  tick(s, input: InputFrame, ctx: TickContext) {          // may mutate s in place; no DOM, timers, network, storage
    const left = input.buttons & BTN.left, right = input.buttons & BTN.right;
    s.player.x += (right ? 2 : 0) - (left ? 2 : 0);
    // … rules only; randomness via ctx.rng; time via ctx.tick * ctx.dt
    s.tick = ctx.tick;
    return s;
  },
  render(s, view) { /* draw or sync the scene graph from s; must not mutate s */ },
  describe: (s) => ({ player: s.player }),
});
```

Rules:

- **`tick` is the only place state changes.** Rendering code may cache view objects, such as meshes and sprites, keyed by entity ID.
- **State must be `structuredClone`-able,** unless you provide `snapshot`/`restore`. Typed-array ECS stores are fine.
- **Input arrives only through `InputFrame`.** Don't attach DOM listeners in simulation code.
- **Read button bits from constants generated from the manifest order.** `TODO(api)`: `@playtest/kit` generates `BTN` from `playtest.json`.
- **When the state shape changes, edit-and-continue** uses `migrate()` if it exists, or replays from frame 0.
