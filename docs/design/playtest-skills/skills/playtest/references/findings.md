# Readiness-report finding codes

| Code | Sev. | Meaning | Fix recipe |
|---|---|---|---|
| PT001 | error | External origin request | Download the asset into `public/` (or `assets` globs) and import it relatively; replace CDN scripts with npm packages |
| PT002 | error | `eval` / `new Function` / string timers | Replace with real functions. Libraries that generate code need a CSP-safe mode (PixiJS is handled automatically) |
| PT003 | error | `blob:`/`data:` scripts or workers | Ship the file in the build and load it by relative URL |
| PT004 | warn | Worker / SharedArrayBuffer / Atomics | Main-thread alternatives. Decoders that use worker pools (e.g. Draco, KTX2): ship pre-decoded or main-thread-decodable assets |
| PT005 | warn | Network beyond build assets | Mock or offline mode behind a flag; keep server logic out of the playable build |
| PT006 | warn | Wall-clock time in simulation | Use tick count × `dt`; fine at Tiers 1–2 (virtualized), blocks Tier 3 |
| PT007 | warn | Transcendental `Math.*` under `strict` | `import { sin, cos, atan2, pow, exp, log } from "@playtest/kit/math"` |
| PT008 | warn | Audio-driven logic | Track durations in game state; play audio as a side effect |
| PT009 | warn | Bad `sort` comparator | Make it total (tie-break by ID); never `() => Math.random() - 0.5`; use `ctx.rng` shuffle |
| PT010 | warn | WeakRef / FinalizationRegistry in simulation | Explicit removal lists |
| PT011 | error | `render` mutates state | Move the mutation into `tick`; cache view data outside the state |
| PT012 | error | `tick` touches DOM / timers / network / storage | Move it to `init` (setup), `render` (output) or input |
| PT013 | error | Double-run divergence | Use the `playtest-determinism-debug` skill (`playtest replay --bisect`) |
| PT014 | info | Adapter overrode framework settings | Nothing to do |
| PT015 | info | No `describe()` | Use the `playtest-tier-up` skill, step A |
| PT016 | info | PixiJS CSP polyfill injected | Nothing to do |
| PT017 | warn | Pointer lock / fullscreen | Works via the shell; provide a non-locked fallback control scheme |
| PT018 | warn | Build size over budget | Compress textures and audio, split levels |
| PT019 | warn | Undeclared keys | Add them to `input.buttons` |
| PT020 | error | Manifest invalid / entry missing | Re-run `playtest init` or fix the fields (`manifest.md`) |
| PT021 | warn | Multithreaded wasm | Use the single-threaded build |
| PT022 | info | Physics only locally deterministic under `strict` | Rapier `-deterministic`, or set `determinism: "local"` |
