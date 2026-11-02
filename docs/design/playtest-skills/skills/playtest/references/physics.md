# Physics engines

| Engine | Determinism | Snapshot | Use |
|---|---|---|---|
| Rapier `@dimforge/rapier2d-deterministic` / `rapier3d-deterministic` | Cross-platform guaranteed | `world.takeSnapshot()` / `World.restoreSnapshot(bytes)` | **Default for `strict`.** Use the `-compat` variant if wasm bundling is awkward |
| Rapier main / `-simd` builds | Same machine only | Same API | `local` only |
| Phaser Arcade | Same engine (JS `Math` trig) | Via game model | `local` |
| Matter.js (incl. Phaser Matter) | Same engine; internal RNG seeded | No official serializer | `local`; Tier 2 needs custom serialization |
| cannon-es | Same engine | Manual | `local` |
| Havok (Babylon) | Unverified | Unverified | `local` until verified |

Rules:

- **Fixed timestep.** Step the world exactly once per tick with `dt = 1 / tickRate`. Never use a variable or accumulated real-time `dt`.
- **No threads.** Multithreaded or SharedArrayBuffer builds are unavailable (PT004/PT021).
- **Under `strict`,** compute initial values (spawn positions, angles) with `@playtest/kit/math`. A `Math.sin` in setup breaks cross-engine equality even with a deterministic engine.
- **Step ordering.** Iterate entities in a stable order (by ID) when applying forces.
