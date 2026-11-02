---
name: playtest-determinism-debug
description: Diagnose and fix nondeterminism in Playtest games, using `playtest replay --bisect` to find the first diverging tick and the state paths that differ, then applying targeted fixes. Covers replays that diverge, PT013 double-run failures, retests marked "diverged", "works on desktop but not iOS", and PT006–PT012 findings. Use whenever replay, rewind or retest results differ between runs, devices or builds, even if the user just says "the bug report replay doesn't match what happened".
compatibility: Requires @playtest/cli 0.1 (stub) and Playwright browsers for cross-engine checks. Pairs with the `playtest` skill.
---

# Debug nondeterminism

> Stub. Goal: the same inputs produce the same checkpoints. With `determinism: "strict"`, this must hold across engines too.

## 1. Classify the divergence

| Symptom | Likely class | First command |
|---|---|---|
| `playtest check` reports PT013 (double run differs) | True nondeterminism on one engine | `npx playtest check --json` → `determinism.firstDivergence` |
| A thread retest says `diverged` on a new build | Code changed behaviour (often expected) | `npx playtest replay <issue-or-thread-url> --compare <oldBuild>` |
| Matches on desktop, differs on iOS | Cross-engine float drift (`strict` only) | `npx playtest check --engine webkit` (`TODO(cli)`: `--cross-engine`) |
| Differs only right after loading | Loading or init order | `npx playtest replay <log> --until 5 --bisect` |

## 2. Bisect

```bash
npx playtest replay <log.ptil|issue-url> --bisect      # prints first diverging tick and differing describe()/state paths
```

Without `describe()`, bisection reports only the tick. Add a minimal `describe()` covering the suspect systems first (`playtest-tier-up`, step A).

## 3. Find the cause

Look at the code that writes the differing paths during the ticks just before the divergence. Typical causes:

| Cause | Fix |
|---|---|
| Physics stepped with variable or accumulated real-time `dt`, or stepped 0 or 2 times per tick | Step exactly once per tick with `1 / tickRate` |
| State mutated in render code | Move it into tick/update (PT011) |
| Logic in audio callbacks or `currentTime` | Track timing in state (PT008) |
| Unstable `sort` (ties, random comparator) | Total comparator with an ID tie-break (PT009) |
| Locale or `Intl` formatting feeding logic | Use locale-independent code |
| Snapshot missing a field (Tier 2: diverges only after a seek) | Add it to `snapshot()`/`restore()`; run the round-trip test |
| Entity iteration order depends on creation timing across reloads | Iterate by stable ID |
| `Math.sin/cos/atan2/pow/exp/log` in simulation under `strict` | `@playtest/kit/math` (PT007) |
| Physics engine only locally deterministic under `strict` | Rapier `-deterministic`, or `determinism: "local"` (PT022) |
| Code that captures real time or real randomness before the harness shims load (rare: global side effects in polyfills) | Remove the capture; report it if it's in a dependency |

Don't "fix" divergence by rounding values in `describe()`. That hides real divergence that will surface later.

## 4. Verify

- `npx playtest check` shows determinism `verified`.
- For cross-build issues, `playtest replay <log> --compare <build>` behaves as the user expects.
- For `strict`, Chromium and WebKit checkpoints match on the sample runs.

Report the cause, the fix, and the verification output to the user.
