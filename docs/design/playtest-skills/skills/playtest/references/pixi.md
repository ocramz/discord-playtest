# PixiJS v8

**Natural tier:** 3 when game state is separate from display objects; otherwise 1.

## What the adapter does automatically

- Imports `pixi.js/unsafe-eval` before renderer init (PT016). Without it, PixiJS v8 throws under Discord's CSP, because it uses `new Function` for shader and uniform code.
- Virtualizes the `Ticker` through `requestAnimationFrame`, and wraps `Renderer.render`.

## Author guidance

- Keep a **single** `pixi.js` version in the bundle, so the polyfill applies to the instance you use.
- `Assets.load` works under the loading barrier with files in the build. Avoid worker-based loading options (`TODO`: confirm the v8 preference name and default).
- Use `app.ticker` callbacks or the Tier 3 contract for logic. Don't use your own `setInterval` loops (virtualized, but harder to reason about).
- `BitmapText` / web fonts: bundle font files (PT001).

## Tier 3 pattern

```ts
export default defineGame<State>({
  init: () => initialState(),
  tick: (s, input, ctx) => step(s, input, ctx),
  render(s, { canvas }) {
    const v = view ?? (view = createView(canvas));   // await app.init() in init(), keep a module-level reference
    syncSprites(v.stage, s);                         // pooled sprites keyed by entity id
    v.app.renderer.render(v.app.stage);
  },
});
```

`TODO(api)`: async renderer initialization inside `init` (`await app.init({ canvas })`). Confirm the `InitContext` exposes the canvas.
