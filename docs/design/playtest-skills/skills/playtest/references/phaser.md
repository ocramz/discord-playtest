# Phaser (3.60+ and 4.x)

**Natural tier:** 1, or 2 with effort. Tier 3 is not recommended, because Phaser owns its loop and its scene graph.

## What the adapter does automatically

- Drives the `TimeStep` through virtualized `requestAnimationFrame`, and sets `fps.smoothStep = false` and `fps.target = tickRate` (PT014).
- Seeds `Phaser.Math.RND` from the run seed and saves `RND.state()` in snapshots.
- Swallows blur and visibility events, so the game never auto-pauses or resets delta.
- Wraps the renderer's render step to switch the random stream (§6.9.1 of the design) and to capture screenshots.

## Author guidance

- Scene clocks (`this.time.addEvent`), tweens and `update(time, delta)` are fine; `delta` is constant under the harness.
- Keep Arcade physics in fixed-step mode (`TODO`: verify the default per version). Configure the Matter runner with a fixed delta.
- Don't let gameplay depend on sound `complete` events (PT008).
- Avoid DOM game objects (`this.add.dom`) for gameplay UI. They render outside the canvas and won't appear in screenshots.
- Don't use the Scale Manager's resize callbacks to change gameplay; the viewport is fixed during runs.
- Plugins loaded from URLs (e.g. `load.plugin` with a CDN URL) trigger PT001. Bundle them.

## `describe()` example

```ts
export const playtest = definePlaytestHooks({
  describe: () => {
    const s = game.scene.getScene("Level") as LevelScene;
    return { level: s.levelId, hero: { x: s.hero.x, y: s.hero.y, vx: s.hero.body.velocity.x, hp: s.hero.hp }, enemies: s.enemies.countActive() };
  },
});
```

## Tier 2 pattern

1. Keep a plain **game model** (entities, stats, timers) alongside the sprites.
2. `snapshot()` serializes the model plus physics state.
3. `restore()` restarts the scene with the model as data (`this.scene.restart({ model })`) and rebuilds sprites from it.

Gameplay-relevant tweens must be represented in the model, or re-created from it with the correct progress.

`TODO(api)`: `@playtest/kit/phaser` helpers for Arcade body serialization.
