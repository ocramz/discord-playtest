# three.js

**Natural tier:** 3 when simulation state is kept outside the scene graph; otherwise 1.

## What the adapter does automatically

- Virtualizes `renderer.setAnimationLoop` / `requestAnimationFrame`, and `Clock` / `Timer`.
- Wraps `WebGLRenderer.prototype.render` (and the WebGPU renderer) to switch the random stream and capture screenshots inside the render call.
- `MathUtils.generateUUID` draws from `Math.random`, so creating objects consumes random numbers. This is harmless thanks to phase separation, but avoid creating gameplay entities inside render code.

## Tier 3 pattern (recommended)

```ts
export default defineGame<State>({
  init: () => initialState(),
  tick: (s, input, ctx) => stepWorld(s, input, ctx),          // plain data; physics stepped once with ctx.dt
  render(s, { canvas }) {
    const v = view ?? (view = createView(canvas));            // lazily create renderer, scene, camera, meshes
    syncMeshes(v, s);                                         // position/rotation from state; add/remove by entity id
    v.renderer.render(v.scene, v.camera);
  },
  describe: (s) => ({ player: s.player, wave: s.wave }),
});
```

- **Never read positions back from meshes into state.** Render is one-way (PT011).
- **Camera controls:** prefer manifest axes (`pointer.x/y`, gamepad sticks) to OrbitControls mutating the camera. If camera state affects gameplay (aiming), keep it in the simulation state.
- **Pointer lock** (`PointerLockControls`) is forwarded to the shell (PT017). Provide a fallback control scheme.

## Assets

- GLTF and texture loaders work under the loading barrier, as long as files are in the build (PT001).
- Draco and KTX2 decoders use worker pools (PT004). Ship uncompressed or meshopt-compressed assets instead (`TODO`: verify main-thread meshopt decoding).
- Prefer `WebGLRenderer` for the widest Discord client support (`TODO`: verify WebGPU availability in Discord's mobile webviews).

## Physics

Rapier `-deterministic` for `strict`; see `physics.md`.
