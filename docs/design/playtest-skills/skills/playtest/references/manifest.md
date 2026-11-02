# `playtest.json` (schema v1)

```json
{
  "$schema": "https://<domain>/schemas/playtest-1.json",
  "name": "Moss Knight",
  "entry": "src/main.ts",
  "tier": 1,
  "adapter": "phaser",
  "tickRate": 60,
  "viewport": [480, 270],
  "orientation": "landscape",
  "input": {
    "buttons": { "left": ["ArrowLeft", "KeyA"], "right": ["ArrowRight", "KeyD"], "jump": ["Space"] },
    "axes": { "aimX": "pointer.x", "aimY": "pointer.y" },
    "pointer": true
  },
  "determinism": "local",
  "checkpointEvery": 60,
  "assets": ["public/**"]
}
```

| Field | Rules |
|---|---|
| `entry` | Module the harness imports. For Tier 3 it must `export default` the game object |
| `tier` | Claimed tier, 0–3. CI verifies it and may report a lower effective tier |
| `adapter` | `phaser` \| `three` \| `pixi` \| `babylon` \| `none` |
| `tickRate` | Steps per second. Physics must step exactly once per tick with `dt = 1 / tickRate` |
| `viewport` | Logical canvas size. Layout code must not depend on the real window size during a run |
| `input.buttons` | ≤ 32 named digital inputs, each with default `KeyboardEvent.code` values. Name them by action (`jump`), not by key |
| `input.axes` | ≤ 8 analog inputs (gamepad sticks, `pointer.x`/`pointer.y`), quantized to int16 |
| `input.pointer` | `true` if the game reads pointer position or buttons |
| `determinism` | `local` (same engine family) \| `strict` (cross-engine) \| `off` (Tier 0) |
| `checkpointEvery` | Ticks between divergence checkpoints (default 60) |
| `assets` | Globs copied into the build; only these can be fetched at runtime |

Mapping inputs:

- Search the source for `KeyboardEvent.code`/`key` literals, Phaser `addKey`/`createCursorKeys`, and pointer listeners. Every key the game reads must appear in some button's key list.
- The harness generates touch controls from `buttons`/`axes`, so action names should read well on screen.
- Changing the `input` section invalidates old input logs for replay. Old threads then retest as `inconclusive`, so avoid churn.

`TODO(cli)`: link the published JSON Schema once hosted.
