# P0: validation spikes, program plan

Status: planned · Covers `docs/design/playtest-design.md` §18 (S1–S19) · Exit criterion from §19: every item passes or has a documented fallback.

This is the umbrella plan. Each session below gets its own standalone plan in `docs/plans/` before it starts. Sessions A and B already have one: [p0-a-bootstrap.md](p0-a-bootstrap.md) and [p0-b-first-contact.md](p0-b-first-contact.md). Later sessions are expanded from the briefs here, because their details depend on what A and B find (above all, Discord's real CSP).

## 1. Constraints and decisions

| Topic | Decision | Consequence |
|---|---|---|
| Cloudflare account | A dedicated free account used only for P0 | Quota exhaustion (S13) can't affect anything else. Every quota-burning target checks the account id |
| Domain | None | All spikes run on the no-domain profile (§4.3). **S15 is deferred** to the pre-public-launch checklist |
| Discord clients | Discord **web** only: Chrome (V8), Safari (JavaScriptCore), Firefox (SpiderMonkey) on macOS | All three engine families get real-Discord coverage. The desktop app, Android and iOS have none; see §6 |
| Code quality | Production quality: spike code is the first cut of the P1 packages | AGENTS.md rules apply in full: closed unions matched exhaustively, pure logic separated from IO, fast-check property tests, no mocks, and `make preflight` green before every commit |
| Discord client automation | Never | Driving a user account is self-botting, which Discord's terms forbid. Real-Discord runs are triggered from the terminal into Activity tabs that a person opened (§2.3) |

## 2. Automation backbone

Each spike gets an automated loop that runs locally in seconds. Real Discord only confirms the local result.

### 2.1 Probe kit (`packages/probe`)

- **Probe.** `{ id, subject, hosts, gesture, timeoutMs, decode, run(ctx) }`.
  - `subject` is either a spike id (`S1`..`S19`) or `environment` for fingerprinting.
  - `hosts` is a subset of `node | local-browser | discord`.
  - `run` returns a `ProbeOutcome`: `measured | failed | unsupported | errored | timed-out`. Metrics are typed per probe and decoded at the storage boundary.
- **Criterion.** A pure function from stored results to a `Verdict`: `pass | fail | fallback(riskId) | unverified(missing environments)`. Criteria encode the §18 pass column and the environments it requires. Because measurement and judgement are separate, changing a criterion re-scores the existing results without re-running anything.
- **Environment.** Every result records host, engine family, browser, OS, Discord platform (when hosted in Discord) and build id. `envKey` gives each environment a stable key, such as `discord/web/safari`, `local/webkit` or `node`.

### 2.2 Results ledger

- **Storage.** A SQLite Durable Object in the spike Worker, enabled only by the `SPIKE` flag. Local runs (Playwright, Node) write JSONL in the same schema.
- **`make report`.** Merges both sources and regenerates `docs/spikes/matrix.md`:
  - one row per probe and one column per environment;
  - one verdict per §18 item;
  - a diff against the previous report.

  It also extracts the latest Discord fingerprints into `fixtures/discord-env/`.

### 2.3 Discord-in-the-loop runner

- **Thin shell.** The shell rarely changes. Probes are loaded per build, and sandbox-side probes load inside the nested opaque-origin iframe.
- **Connection.** Each open Activity tab holds a hibernating WebSocket to the lab Durable Object. Results and logs travel over that socket in batches.
- **Pushed runs:**
  - `make deploy` (about 10 s) deploys and then tells every connected tab to reload, and each tab re-runs its probes automatically;
  - `make probe P=<spike|probe-id> T=discord` pushes a run to the connected tabs and streams the verdicts into the terminal.
- **Safety.** The terminal side authenticates with an admin secret, and only probe ids in the deployed bundle can be run. There's no code push, and the CSP forbids `eval` anyway.
- **Diagnostics.** Console output, errors and `securitypolicyviolation` events from the shell and the sandbox are forwarded to the ledger.
- **Quota.** Pushes are server→client, and client messages are batched. The Free plan's DO request budget (§4.4.1) stays negligible.

The working loop: keep the Activity open in Chrome, Safari and Firefox, edit, run `make deploy`, and read the results in the terminal. Only gesture probes (S4, S12) need a click.

### 2.4 Discord fingerprint → local emulator

Session B captures, from inside real Discord:
- the CSP of the shell and of the nested sandbox, by forcing a harmless violation and reading `originalPolicy`;
- the permissions policy, where the browser exposes it;
- which APIs are available;
- the request paths and headers the Worker receives (the `/.proxy` convention);
- which response headers survive the proxy.

These go into `fixtures/discord-env/<browser>.json`. Session D's `packages/devharness` (the seed of `playtest dev`, §20.6) replays them locally: CSP headers, path prefix, an outer frame with the same permissions, and the nested sandbox. `make fidelity` runs the fingerprint probe locally and diffs the result against the captured file. A mismatch is a harness bug, which keeps the emulator honest.

### 2.5 Local engine matrix

- **Browsers.** Playwright runs every `local-browser` probe through the emulator in Chromium, WebKit and Firefox. Pure probes also run in Node.
- **Phone proxy.** For S6 and S16, Chromium runs with CDP CPU throttling at 4× and 6× (`Emulation.setCPUThrottlingRate`).
- **iOS (optional).** iOS Simulator Safari via `xcrun simctl openurl`. Xcode is installed but has no iOS runtime yet, so this needs a one-off download.

### 2.6 Shared replay runner (`packages/replay`)

One `ReplayRunner` (§15) with a Node backend for Tier 3 and a Playwright backend for Tiers 1–2. Each sample game gets a seeded synthetic-input generator. S5, S7, S9 and S18 all use it, and P1/P3 retests reuse it unchanged.

### 2.7 Infra tooling (`tools/`)

- Idempotent setup: R2 buckets via wrangler, Worker secrets from `.dev.vars`, and guild-scoped slash commands via the Discord REST API (guild commands update instantly).
- `gh`-driven CI end-to-end runs and start-latency statistics.
- A Cloudflare GraphQL Analytics scraper, for requests, errors and CPU quantiles.
- A Tail Worker that records `cpuTime`, `wallTime` and `outcome` for each invocation.
- A load generator that drives the shell's real session-client module from Node, not a re-implementation.
- A corpus fetcher, and a headless agent-eval runner.

### 2.8 Make targets

| Target | Purpose | Introduced in |
|---|---|---|
| `preflight` | `tsc -b`, plus vitest across the node project and the `@cloudflare/vitest-pool-workers` project (real workerd, DOs and R2, no mocks). fast-check shrinks fully | A |
| `test-quick` | Same tests, but fast-check stops shrinking at the first failure (`endOnFailure`) | A |
| `dev` / `deploy` | Local Worker with the shell rebuilt on change / guarded deploy to the spike account, then a reload pushed to open tabs | A / B |
| `probe P= T=local\|discord\|node\|all` | Run probes and stream verdicts | B |
| `report` | Regenerate `docs/spikes/matrix.md` and the fingerprints | B |
| `e2e` | Playwright system tests | B |
| `fidelity` | Emulator versus captured fingerprints | D |
| `drift`, `bench-overhead`, `bench-seek` | S5, S6, S7 | G |
| `ci-e2e`, `ci-fork-e2e`, `ci-latency N=` | S8, S9 | H |
| `loadtest`, `cpu-limits`, `quota-exhaust CONFIRM=<account id>` | S13, S14 | I |
| `bench-builder` | S16 | K |
| `corpus`, `skills-eval` | S17, S18. These use the network and API tokens and are never part of `preflight` | L, M |

## 3. Repository layout

Names follow the design, so P1 builds on the same packages.

```text
apps/worker/          Worker router, Durable Objects, /g/*, /api/*, /ci/*; spike routes behind SPIKE
apps/shell/           Activity shell: Discord SDK, probe host, later the harness controller
packages/protocol/    Appendix A types, PTIL codec, session token
packages/runtime/     Sandbox runtime: pure scheduler core plus browser shims (§6.2)
packages/adapters/    Phaser, three.js, PixiJS render-phase hooks
packages/probe/       Probe kit: model, criteria, runner, matrix reporter
packages/probes/      Probe suites, by spike
packages/devharness/  Local Discord emulator plus the Playwright engine matrix
packages/replay/      ReplayRunner: Node and Playwright backends
packages/builder/     CI bundled-mode build; browser builder
packages/cli/         @playtest/cli: init detector (S17), minimal check (S18)
examples/             Original sample games: Phaser Arcade, three.js + Rapier -deterministic, PixiJS v8, Tier 3 canvas
tools/                Setup, lab CLI, report, loadgen, analytics, corpus, evals
fixtures/discord-env/ Captured Discord fingerprints
docs/spikes/          setup.md, generated matrix.md, one findings note per spike
```

Toolchain: npm workspaces (npm 11 is installed, pnpm isn't), TypeScript strict with `erasableSyntaxOnly` (so Node 24 runs `tools/` directly and type-strippers accept all code), esbuild, vitest, fast-check, Playwright, and wrangler as a dev dependency. GNU Make 3.81 ships with macOS, so the Makefile avoids Make 4 features.

## 4. Sessions

Every session ends with atomic, bisectable commits. The user makes them; agents don't commit. Each session also appends an entry to `docs/implementation.md`.

| # | Session | Spikes | Depends on |
|---|---|---|---|
| A | Bootstrap and deploy loop | none | none |
| B | Probe kit, ledger, Discord-in-the-loop, first contact | S1 (web, seed), S11 (proxy conventions), S19 (`blob:`/`data:` from the fingerprint) | A |
| C | Auth and sessions | S11 | B |
| D | Local Discord emulator and the production `/g/*` route | S1 (local), S19 (asset packs, local) | B |
| E | Runtime core | Enables S3, S5–S7 | A; can run alongside B and D |
| F | Sample games and minimal adapters | S1, S2, S3, S10 | D, E |
| G | Replay runner and performance | S5, S6, S7 (client), S9 (throughput) | F |
| H | CI end to end | S8, S7 (CI), S9 (latency); riders Q12, Q13 | F |
| I | Free-plan accounting | S13, S14, S19 (caching and requests per session) | C |
| J | Discord SDK interactions | S4, S12; rider Q5 | C |
| K | Browser builder benchmark | S16 | C, D |
| L | `init` detection corpus | S17 | A |
| M | Agent-skill evals | S18 | G, L |

The critical path is A → B → D → F → G → M. E, C and L are parallel lanes. H, I, J and K hang off the critical path once their dependencies land.

### Briefs

**A. Bootstrap and deploy loop.** See [p0-a-bootstrap.md](p0-a-bootstrap.md). Workspaces, strict TypeScript, vitest with node and workers pools, fast-check, the Makefile, `wrangler.jsonc` (both R2 buckets, static shell assets, the `SPIKE` flag), an exhaustive route parser with `/healthz`, a hello shell, setup scripts and `docs/spikes/setup.md`. Exit: `make preflight` is green, and `make deploy` serves the hello shell inside Discord web.

**B. First contact.** See [p0-b-first-contact.md](p0-b-first-contact.md).
- Builds: the probe kit, the lab Durable Object (ledger plus control hub), log forwarding, `make probe`, `make report` and `make e2e`.
- Probes: `env.fingerprint`, `proxy.request-shape`, `proxy.response-headers` and `sandbox.nested-opaque-module`, the core of S1.
- Manual step: launch the Activity once in each of the three browsers.
- Exit: three fingerprints committed, and S1 has a web verdict.

**C. Auth and sessions (S11).**
- Flow: `ready` → `authorize` → `POST /api/token`. The Worker exchanges the code, calls `/users/@me`, and checks membership with Get Activity Instance (bot token).
- Session token: the HMAC token from §5.2, with a pure encoder/verifier property-tested for expiry and tamper rejection.
- SessionDO: a minimal version with hibernating WebSockets, `hello`/`welcome`/`token` messages and refresh before expiry.
- Probes record:
  - end-to-end latency;
  - the Get Activity Instance latency and its rate-limit headers (`X-RateLimit-*`);
  - refresh behaviour across a forced expiry.
- Exit: S11 passes with its limits written into `docs/spikes/S11.md`.

**D. Local Discord emulator.**
- `packages/devharness` serves the Worker locally (miniflare) behind a proxy emulator driven by `fixtures/discord-env/*.json`. The emulator applies the path convention and CSP headers, wraps the shell in an outer frame with matching permissions, and nests the sandbox.
- Playwright drivers for Chromium, WebKit and Firefox. `make probe T=local` and `make fidelity`.
- The production `/g/*` route: reads from R2, with `Content-Type`, `Cache-Control: public, max-age=31536000, immutable` and `Access-Control-Allow-Origin: *` (§4.3). It replaces B's static `/g/probe/` files.
- S19 asset-pack probe: images from `blob:` and `data:` URLs inside the sandbox.
- Exit: `make fidelity` is clean for all three browsers.

**E. Runtime core.** Pure state machines for:
- the virtual clock and timer scheduler (due, seq);
- the rAF queue;
- the sim and cosmetic PRNG streams (sfc32, §6.9.1);
- loading-barrier ordering (§6.9.4).

Also the PTIL codec (§6.8); `HostToSandbox`/`SandboxToHost` over a `MessageChannel` (`boot`, `ticks`, `ticked`, `capture`) with exhaustive handlers; the browser shims around the pure core (§6.2); and the bootstrap order (§6.1).

Property tests:
- timer and rAF firing order is a pure function of the schedule;
- `pause` freezes virtual time;
- the barrier delivers completions in request order whatever the network order;
- PTIL encode/decode round-trips;
- cosmetic draws never advance the sim stream.

**F. Sample games and adapters.**
- Four original sample games (Phaser Arcade platformer, three.js + Rapier `-deterministic`, PixiJS v8 with `Assets`, Tier 3 canvas), plus render-phase hooks for Phaser, three.js and PixiJS.
- Probes, local first, then Discord:
  - S1: the sample game boots;
  - S2: Rapier `-deterministic` and `-compat` worlds step with no CSP violations;
  - S3: `pixi.js/unsafe-eval` renders, and `Assets` load order is deterministic under the barrier;
  - S10: `createImageBitmap` inside the render hook, and `MediaRecorder` on `canvas.captureStream()`.
- If time allows, a Havok smoke test (§6.12).

**G. Replay runner and performance.**
- `packages/replay`, plus a seeded input generator for each game.
- S5: a 10-minute run (36,000 ticks at 60 Hz) fast-forwarded with a checkpoint every 60 ticks, compared across Node, Chromium, WebKit and Firefox locally and in Discord web on all three browsers. The output is the first divergent tick per engine pair. Rapier must match everywhere, and Arcade drift is recorded.
- S6: the same game raw versus virtualized, timed against the runtime's captured real clock, unthrottled and at 4×/6× CPU throttling.
- S7: Tier 1 seek throughput with rendering skipped, in Discord web and in Playwright.
- S9: Tier 3 ticks/s in Node.

**H. CI end to end.**
- Repos: a reusable-workflow repo and a sample-game repo in a GitHub org, plus a fork of the game repo in a second org for the fork-PR path (§7.3).
- Worker endpoints:
  - OIDC verification: RS256 via WebCrypto against cached JWKS, with every claim check in §7.3;
  - `/ci/job`;
  - `/ci/presign`: SigV4 against R2's S3 endpoint, at most 100 URLs per call, scoped to the job's prefixes;
  - `/ci/result`.
- `packages/builder` bundled mode.
- `make ci-e2e`: a push via `gh` builds the game, the script fetches `/g/b/<hash>/index.html` and runs the S1 probe on it. `make ci-fork-e2e` does the same through `workflow_run`. `make ci-latency N=20` computes p50/p95 queue and start latency from run and job timestamps.
- Riders:
  - Q12: does GitHub's new-file URL prefill path and contents?
  - Q13: are R2 temporary credentials available on Free?

**I. Free-plan accounting.**
- **Instrumentation.** The load generator emulates players at the §10.3 presence rates. The GraphQL scraper and the Tail Worker measure requests and CPU for each player-hour.
- **CPU limits (S14).** Inside Workers, the clock doesn't advance during pure CPU work, so a time-based busy loop measures nothing. The burner is calibrated by iteration count, and a bisection finds where the tail `outcome` becomes `exceededCpu`, separately for the Worker and for a DO.
- **S14 workloads.** Presigning 100 URLs, OIDC verification, webhook HMAC verification, a 40-row outbox batch and thread-list queries, each scored as p99 CPU against the measured limit.
- **20:1 ratio (S13).** The decisive test sends well over 100k inbound WebSocket messages over a few connections and checks whether the DO keeps answering.
- **Quota exhaustion.** `make quota-exhaust` runs shortly before 00:00 UTC on the spike account, DO first and then Worker requests, and records the error codes.
- **S19.** Each run uses a unique build hash, which makes cold, warm and relaunch hit counts on `/g/*` attributable, per browser.

**J. Discord SDK interactions.**
- S4: the shell overlay requests pointer lock and forwards movement; this needs one click per browser.
- S12:
  - a guild `/spike link` command posts a card whose button launches the Activity (interaction callback `LAUNCH_ACTIVITY`);
  - `shareLink` with a `custom_id`, round-tripped into a new instance and into an existing one;
  - the `custom_id` length limit (Q5), bisected over a handful of manual shares.

**K. Browser builder benchmark (S16).**
- Type-stripper candidates: sucrase and ts-blank-space, plus esbuild-wasm if F shows that the CSP allows wasm.
- The Merkle module graph (§7.4) and `/api/upload` batching, at most 40 files per request.
- A 200-file synthetic corpus with a set of typical edits.
- Measured: edit-to-play time and upload bytes, in throttled Chromium and in Discord web.

**L. `init` detection corpus (S17).**
- The `packages/cli` `init` detector is a pure function over a `RepoView`. Property test: adding files that match no signal never changes the result.
- Corpus: about 80 public repos (about 20 per framework), found with `gh search repos` and curated by hand. Shallow clones are cached under `.cache/corpus/`, and labels are written once in `fixtures/corpus/labels.json`.
- `make corpus` reports accuracy per framework against the ≥ 90% bar, and counts the corrections needed for viewport and inputs.

**M. Agent-skill evals (S18).**
- A minimal `playtest check --json`: manifest validation, the lint subset, and the double-run via `packages/replay`.
- Evals in the standard `evals/` layout for each skill, run with headless `claude -p` with and without the skills installed. Grading uses the resulting `check` JSON and checks that no new findings appear.
- It spends API tokens, so it only runs on explicit `make skills-eval`.

## 5. Spike coverage

The "Required environments" column is what the criterion needs for `pass`. Environments with no evidence make the verdict `unverified`.

| # | §18 pass criterion (short) | Session | Automated hosts | Real Discord (web) | Required environments not reachable |
|---|---|---|---|---|---|
| S1 | Sample game boots on all four clients | B → D → F | local × 3 engines | Chrome, Safari, Firefox (auto) | desktop app, Android, iOS |
| S2 | Rapier world steps, no CSP violations | F | local × 3, Node | × 3 (auto) | desktop app, Android, iOS |
| S3 | Pixi renders; deterministic load order | F | local × 3 | × 3 (auto) | none (the CSP is the risk) |
| S4 | Pointer lock on desktop and web, or documented unsupported | J | local Chromium (Playwright clicks count as gestures) | × 3 (1 click each) | desktop app |
| S5 | Rapier matches across engines; Arcade drift tick recorded | G | Node, local × 3, optional iOS Simulator | × 3 (auto) | real Android/iOS (JSC via Safari is a proxy) |
| S6 | < 10% frame-time overhead on a mid-range phone | G | Chromium at 4×/6× throttling | × 3 (auto) | mid-range phone |
| S7 | Ticks/s measured, client and CI | G, H | local, CI Playwright | × 3 (auto) | none |
| S8 | Push → playable build, no repo secrets; fork path | H | fully automated (`gh`) | n/a | none |
| S9 | Tier 3 ticks/s; p50/p95 job start latency | G, H | fully automated | n/a | none |
| S10 | Screenshot and clip capture, or clips dropped | F | local × 3 | × 3 (auto) | desktop app, Android, iOS |
| S11 | Auth end to end; limits documented | B, C | workers-pool integration tests | × 3 | none |
| S12 | Thread opens at the anchored frame from a bot card | J | none | manual clicks | mobile launch behaviour |
| S13 | §4.4.3 numbers replaced by measurements | I | fully automated | 1 real session per browser for per-session counts | none |
| S14 | All workloads under the effective CPU limit with margin | I | fully automated | n/a | none |
| S15 | Domain profile | **Deferred** (no domain) | n/a | n/a | n/a |
| S16 | Edit-to-play < 2 s on a mid-range phone | K | Chromium at 4×/6× throttling | × 3 | mid-range phone |
| S17 | ≥ 90% correct adapter and entry | L | fully automated after one-off labelling | n/a | none |
| S18 | Skills measurably improve `check` outcomes | M | fully automated | n/a | none |
| S19 | Requests per session cold versus warm; client caching; asset-pack decision | B (CSP), D (local), I (counts) | local × 3 | × 3 | desktop app, Android, iOS caching |

Riders, answered along the way: Q5 (`custom_id` length; J), Q12 (prefilled new-file link; H), Q13 (R2 temporary credentials; H). Havok determinism (§6.12) is an optional extension of F and G.

## 6. Coverage gap: desktop app, Android, iOS

Discord web covers V8, JavaScriptCore and SpiderMonkey inside real Discord, but its stand-ins aren't exact:
- Safari isn't iOS. iOS Discord uses WKWebView.
- Chrome isn't the desktop app. Electron's frame permissions may differ, which matters for pointer lock in S4.

Mitigations:
1. **Drop-in testers.** Probes run themselves on launch, so anyone in the test guild who opens the Activity on a phone or in the desktop app contributes results. They're tagged with the SDK's platform and the user agent, and `make probe T=discord` reaches their tab too. Until the app is public, Discord restricts who can launch it, so testers may need adding to the app's team or tester list. Session A confirms this.
2. **Local stand-ins.** Playwright WebKit with mobile emulation; optionally iOS Simulator Safari.
3. **Honest reporting.** A criterion that names a client with no evidence reports `unverified`, never `pass`. The findings note links the matching risk (R1, R2, R14).

**Recommendation.** P1 can start once the web evidence passes and the mobile items are `unverified` with stand-in evidence, because §17 already has fallbacks for the mobile risks. That decision is the user's at the end of P0.

## 7. Results and feedback into the design

- **Findings notes.** Each spike gets `docs/spikes/S<n>.md`: method, environments, measurements, verdict, and the fallback taken if any. `docs/spikes/matrix.md` is generated and never edited by hand.
- **Failures.** A failing spike first uses its §17 mitigation. If a failure makes a spec impossible or contradictory, the user is asked before `playtest-design.md` changes (AGENTS.md).
- **Log.** `docs/implementation.md` gets an entry per session.

## 8. Verification

- **Per session:** `make preflight` is green before every commit, plus the session's exit command.
- **End of P0:** `make report` gives every §18 row a verdict of `pass`, `fallback` (linked to its §17 mitigation), `unverified` (with the missing environments and any stand-in evidence) or `deferred` (S15). The summary goes into `docs/implementation.md`.
