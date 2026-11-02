# Plain canvas/WebGL and other JS engines (Excalibur, KAPLAY, LittleJS, …)

**Adapter:** `none`. Virtualization still applies (rAF, timers, time, RNG, input, storage), so most games work at Tier 1 unchanged.

## Limitations without an adapter

- **No render-phase hook.** The harness can't tell rendering from simulation, so:
  - seeking renders every frame (slower);
  - `Math.random` calls in drawing code consume the simulation's random stream. Avoid randomness in drawing code, or move to Tier 3.
- **Screenshots** are captured right after the animation-frame flush, in the same task, so WebGL games don't need `preserveDrawingBuffer`.

## Recommended structure (Tier 3)

```text
src/
  sim/      state.ts, tick.ts, rules/*.ts   ← pure: no DOM, no timers, no network
  view/     render.ts, sprites.ts           ← reads state, draws
  main.ts   export default defineGame({ init, tick, render, describe })
```

Engines that own their loop (Excalibur, KAPLAY, LittleJS) fit Tier 1 directly. For Tier 3, use them as renderers only, or keep their logic deterministic under virtualization.

`TODO`: dedicated adapters, with render hooks, for the most-used engines.
