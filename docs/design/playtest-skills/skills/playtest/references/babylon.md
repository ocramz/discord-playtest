# Babylon.js

**Natural tier:** 1–2; Tier 3 is possible with logic in plain modules.

## Engine setup

The adapter can't change engine options after construction, so construct the engine like this:

```ts
const engine = new Engine(canvas, true, {
  deterministicLockstep: true,
  lockstepMaxSteps: 4,
  timeStep: 1 / 60,          // must equal 1 / tickRate from playtest.json
});
```

- Put gameplay logic in `scene.onBeforeStepObservable` (fixed steps), not in `onBeforeRenderObservable`.
- The adapter wraps `Scene.render` for the random stream and screenshots.
- Havok physics is wasm, and its cross-engine determinism is unverified. Use `determinism: "local"` until it's verified.

## Headless potential

`NullEngine` runs Babylon without WebGL. To keep the game headless-capable for faster CI retests (`TODO`: verify):

- keep simulation code free of `camera.attachControl`, `DynamicTexture` and DOM access;
- load assets through the build.

## `describe()` / Tier 2

- `describe()` should return mesh positions as plain numbers, not `Vector3` instances.
- For Tier 2, serialize your game model plus physics state. Re-create meshes in `restore()`.
