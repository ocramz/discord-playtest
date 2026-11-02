# P0-B: probe kit, ledger, Discord-in-the-loop, first contact

Part of [p0-spikes.md](p0-spikes.md) · Spikes:
- S1 (web), seed;
- S11, proxy path conventions only;
- S19, `blob:`/`data:` evidence from the CSP.

Depends on: A.

## Goal

Build the automation the rest of P0 runs on:
- probes with typed outcomes;
- pure pass criteria;
- a results ledger;
- a control channel that lets the terminal trigger probe runs inside Activity tabs open in real Discord.

Then use it for first contact. Capture Discord's environment (CSP, permissions, proxy behaviour) from Chrome, Safari and Firefox, and get the first S1 verdict: a nested opaque-origin sandbox loading ES modules from `/g/`.

## Out of scope

- Auth (C). The probe host runs before `authorize`, and the spike routes don't use session tokens.
- The R2-backed `/g/*` route (D). Here, `/g/probe/<buildId>/` is served from static assets.
- The local emulator (D).

## Key unknowns this session resolves

1. **Path convention.** Does a request from the shell to `/x` or `/.proxy/x` reach the Worker, and with which path?
2. **WebSockets.** Do they upgrade through the proxy, and on which path?
3. **Response headers.** Which ones survive: `Cache-Control`, `Access-Control-Allow-Origin`, `Content-Type`, and custom headers?
4. **CSP.** What is the exact policy on the shell document, and on a nested document under `/g/`?
5. **`'self'` in the sandbox.** Does the sandbox's `'self'` match its URL's origin, so that module scripts load? This is the core of S1. CSP's `'self'` inside a sandboxed, opaque-origin document is where browsers differ.
6. **Reload.** Does `location.reload()` work inside Discord's Activity frame? This decides how `reload` pushes are handled.

## Deliverables

### 1. `packages/protocol` (initial)

The Appendix A "Common" types (`JsonValue`, `EngineFamily`, `Tier`), plus the `assertNever` helper. Session E extends this package.

### 2. `packages/probe` (the probe kit)

**Model (`src/model.ts`).** All closed sets are `as const` arrays plus derived unions (see A, `erasableSyntaxOnly`).
- `SpikeId`: `S1`..`S19`.
- `Host`: `node | local-browser | discord`.
- `Environment` is discriminated by `host`:
  - `discord`: `{ platform: "desktop" | "mobile"; browser; engine; os; userAgent; buildId; instanceId }`;
  - `local-browser`: `{ browser; engine; os; emulator: FingerprintRef | "none"; buildId }`;
  - `node`: `{ nodeVersion; engine: "v8"; buildId }`.

  `envKey(env)` gives the stable column key, for example `discord/web/safari`.
- `ProbeId`: a branded string, `"<subject>.<slug>"`.
- `Probe<M>`:
  - `{ id; subject: { kind: "spike"; spike: SpikeId } | { kind: "environment" } }`;
  - `hosts: readonly Host[]; gesture: "none" | "click"; timeoutMs`;
  - `decode(json: JsonValue): M | DecodeError; run(ctx): Promise<ProbeOutcome<M>>`.
- `ProbeOutcome<M>`:
  - `measured { metrics: M; evidence? }`;
  - `failed { reason; evidence }`;
  - `unsupported { reason }`;
  - `errored { error }`;
  - `timed-out { afterMs }`.
- `ProbeResult`: `{ resultId; runId; probeId; env; startedAt; durationMs; outcome }`.
- **Boundary decoding.** Results are decoded with valibot, which is small and tree-shakes, so it can ship in the shell. Each probe's metrics schema doubles as its `decode`.

**Criteria (`src/criteria.ts`).** Pure.
- `Criterion`: `{ spike; text; required: EnvRequirement[]; evaluate(results): Verdict }`.
- `EnvRequirement`: `{ label; matches(env): boolean }`.
- `Verdict`:
  - `pass { evidence }`;
  - `fail { reason }`;
  - `fallback { risk: RiskId; reason }`;
  - `unverified { missing: EnvRequirement[]; partial? }`;
  - `deferred { reason }`.
- B ships criteria for S1 (web portion) and S19 (CSP evidence only). The criteria for all other spikes start out `unverified` with "no probes yet". S15 is `deferred`.

**Runner (`src/runner.ts`).**
- `selectProbes(all, { host, selector })` is pure.
- `runProbes(selected, ctx, sink)` runs probes sequentially. It enforces each probe's timeout and turns exceptions into `errored`. Results go to a `ResultSink` interface, which is the IO boundary.

**Matrix (`src/matrix.ts`).** Pure.
- `buildMatrix(results, criteria)`: for each (probe, env key), the newest result by `startedAt` decides the cell. Each criterion gets a verdict.
- `renderMarkdown(matrix, previous?)`: a table plus a "changed since last report" section.

**Property tests (node project).**
- **Criteria:**
  - verdicts don't depend on the order of results;
  - a criterion whose required environment has no result is never `pass`;
  - adding results from environments no requirement matches never changes a verdict.
- **Matrix:** the latest-wins cell doesn't depend on input order, and re-rendering an unchanged matrix produces no "changed" entries.
- **Decoding:** results generated from the model always survive encode → JSON → decode; arbitrary JSON never makes the decoder throw (it returns `DecodeError`).
- **Selection:** a selected probe always supports the host.

### 3. Lab Durable Object (`apps/worker/src/lab/`)

One SQLite DO class, `LabDO`, with one instance (`idFromName("lab")`). It plays two roles, ledger and control hub. Keeping them in one class avoids a DO-to-DO hop per result batch, which would double the DO request cost. It exists only when `SPIKE` is set.

**Storage.** Tables:
- `results(result_id PK, run_id, probe_id, env_key, env_json, started_at, duration_ms, outcome_kind, outcome_json, build_id, received_at)`;
- `logs(id PK, run_id, source, level, message, at)`.

Batches are capped at 64 results or 256 KB, and logs at 200 entries per minute per socket. A tab that floods can't burn the daily row-write budget (§4.4.1).

**Control hub.** WebSocket Hibernation API.
- **Socket roles.** Each socket is tagged with its role, `client` (an Activity tab or a local browser) or `controller` (the terminal). A controller authenticates with the `SPIKE_ADMIN_TOKEN` secret, sent as a WebSocket subprotocol.
- **Attachment.** Each socket's attachment holds `{ role, envKey, buildId, probeIds digest }` and stays under the 2,048-byte limit.
- **Pure core (`hub.ts`).** `step(state, event) → { state, effects }`.
  - Events: `client-hello`, `controller-run`, `client-results`, `client-logs`, `socket-closed`, `deployed`.
  - Effects: `send(socket, msg)`, `persist(results | logs)`.

  The DO class only maps sockets and executes effects.
- **Messages.** Closed unions, matched exhaustively.

  | From → to | Messages |
  |---|---|
  | Client → lab | `hello { env, buildId, probeIds }`, `results { runId, batch }`, `logs { batch }` |
  | Lab → client | `run { runId, selector }`, `reload { buildId }` |
  | Controller → lab | `run { selector, target: EnvFilter }`, `watch {}` |
  | Lab → controller | `clients { list }`, `run-started { runId, clients }`, `result`, `log`, `run-finished { runId, missing }` |

**Property tests for `hub.ts`.**
- A `controller-run` reaches exactly the connected clients that match the filter and whose `probeIds` contain the selector.
- A closed socket never receives effects.
- `run-finished` lists exactly the targeted clients that haven't reported.
- Rebuilding the client registry from the socket attachments after hibernation gives the same fan-out as before.

### 4. Worker routes (spike only; `parseRoute` returns them only when `config.spike`)

| Route | Handler |
|---|---|
| `GET /spike/control` (WebSocket) | `LabDO` |
| `POST /spike/results` | `LabDO`. HTTP fallback for clients without a socket (local Playwright runs) |
| `GET /spike/results?after=<received_at>` | `LabDO`. Admin token |
| `POST /spike/notify` | `LabDO` `deployed` event, which broadcasts `reload`. Admin token |
| `ANY /spike/echo`, also accepted under `/.proxy/spike/echo` | Returns the method, the path exactly as received, the query, and the request headers. Cookies and authorization headers are dropped, and the client IP is replaced by a salted hash |
| `GET /spike/headers` | Fixed response with the headers whose survival is measured: `Cache-Control: public, max-age=31536000, immutable`, `Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers: *`, `Content-Type: text/javascript`, `ETag`, `X-PT-Probe: 1` |

Integration tests (workers pool, real workerd):
- results posted over HTTP come back from `GET /spike/results`;
- a controller WebSocket's `run` arrives on a client WebSocket, and the client's `results` reach the controller and the ledger;
- without the admin token, controller connections and notify are rejected;
- with `SPIKE` unset, every `/spike/*` path is `not-found`.

### 5. Shell probe host (`apps/shell`)

- **Startup.** After the A state machine reaches `ready`, or immediately in `outside-discord` mode, which becomes host `local-browser`, the shell builds its `Environment` and runs `proxy.request-shape` first. That probe determines the path convention, and a pure `proxiedUrl(path, convention)` uses it for every later request, including the control WebSocket.
- **Running.** It then connects to `/spike/control`, sends `hello` and runs every probe for its host. It also runs probes on each `run`.
- **Reload.** On `reload { buildId }`, the shell calls `location.reload()`. If it comes back on the old build, or reload is refused, the shell records that and falls back to re-importing the probe bundle for the new build id, then re-running it. Unknown 6 is answered either way.
- **Log forwarding.** It wraps `console.*` and keeps the original, and listens for `error`, `unhandledrejection` and `securitypolicyviolation`. Sandbox logs arrive over the sandbox's `MessagePort`. Everything is batched every 2 s or 50 entries.
- **UI.** A plain DOM list of probes with their outcome, so a tab shows pass/fail without devtools.

### 6. Probes (`packages/probes`)

| Probe | Hosts | What it records |
|---|---|---|
| `environment.fingerprint` | discord, local-browser | See the field list after this table |
| `S11.proxy-request-shape` | discord, local-browser | For each of `/spike/echo`, `/.proxy/spike/echo` and a relative `spike/echo`: whether it reached the Worker, and the path and headers the Worker saw. Also whether `wss` upgrades work on `/spike/control` and `/.proxy/spike/control`. Output: the convention the shell will use |
| `S11.proxy-response-headers` | discord, local-browser | Which of the `/spike/headers` headers arrive, read from the shell (same origin) and from inside the sandbox (CORS) |
| `S1.nested-opaque-module` | discord, local-browser | See the steps after this table |

`environment.fingerprint` records:
- **CSP of the shell document.** The probe forces violations: an image from `https://pt-probe.invalid`, `eval("1")`, and a worker from a `blob:` URL. It records each violation's `effectiveDirective` and `originalPolicy`.
- **CSP of the nested sandbox document,** captured the same way inside it.
- **Whether `data:` and `blob:` images load.** Evidence for the S19 asset-pack decision.
- **Whether a minimal wasm module instantiates.** An early signal for S2 and K.
- **Permissions policy:** `document.featurePolicy` or `document.permissionsPolicy` `allowedFeatures()`, where available.
- **Frame context:** `location` (origin, path, query keys only), `ancestorOrigins`, `isSecureContext`, `crossOriginIsolated`, whether `localStorage` throws.
- **API presence:** `OffscreenCanvas`, `createImageBitmap`, `MediaRecorder`, `captureStream`, `requestPointerLock`, `getGamepads`, `WebSocket`.
- **The user agent.**

`S1.nested-opaque-module` runs these steps:
1. The shell creates `<iframe sandbox="allow-scripts" src="/g/probe/<buildId>/sandbox.html">`, adjusted to the path convention.
2. The sandbox's classic `boot.js` installs listeners and then calls `import("./mod.js")`. `mod.js` statically imports `./dep.js`.
3. The sandbox reports back over a `MessagePort` that the shell transferred with `postMessage(…, "*")`.

Recorded: success, time to module ready, `self.origin`, `import.meta.url`, and any violation.

The sandbox files live in `apps/shell/public/g/probe/` and are copied to `dist/g/probe/<buildId>/`. `_headers` gives them `Access-Control-Allow-Origin: *` and immutable caching. The engine classifier is a pure function of the user agent plus feature flags, `classifyEngine(ua, features) → EngineFamily | "unknown"`. It's tested on the user agents captured in this session, which then become fixtures.

### 7. Tools and Make targets

- **`tools/lab` (`make probe P=<selector> T=discord|local|all`).** Connects as a controller and sends `run`. It streams each result with its verdict impact, and exits non-zero if any targeted client misses the timeout or a selected criterion regresses. `T=local` uses Playwright against `make dev` (local hosts in B have no Discord CSP; D adds the emulator).
- **`tools/report` (`make report`):**
  - pulls `/spike/results` and `.cache/results/*.jsonl`;
  - writes `docs/spikes/matrix.md`;
  - writes the newest fingerprint per Discord browser to `fixtures/discord-env/<browser>.json`, normalised so that unchanged environments produce no diff.
- **`make deploy`.** Extended to POST `/spike/notify` after `wrangler deploy`.
- **`make e2e`.** Playwright (Chromium, WebKit, Firefox; installed by `make install-browsers`). It starts `wrangler dev`, opens the shell outside Discord in each browser, and checks that every `local-browser` probe produces a result in the ledger and that `make report` renders it. This tests the plumbing end to end without Discord.

## Commits (in order, each with `make preflight` green)

1. `Protocol: common types and assertNever`.
2. `Probe kit: model, decoding, criteria, runner selection, matrix`: pure, with property tests.
3. `Worker: LabDO ledger and control hub, spike routes`: the hub state machine with property tests, plus workers-pool integration tests.
4. `Shell: probe host, control client, log forwarding`.
5. `Probes: environment fingerprint, proxy shape and headers, nested opaque module`: including the `/g/probe/` static files.
6. `Tools: lab CLI, report, deploy notify, Playwright e2e`.
7. `Spike results: Discord web fingerprints and first matrix`: after the manual run. Adds `fixtures/discord-env/*.json`, `docs/spikes/matrix.md`, `docs/spikes/S1.md` (web findings), the `docs/spikes/S11.md` proxy section, and the implementation-log entry.

## Verification

1. `make preflight` and `make e2e` are green.
2. `make deploy`, then launch the Activity in the test server from Discord web in Chrome, Safari and Firefox (the only manual step, about 2 minutes). Leave the tabs open.
3. `make probe P=all T=discord` reports results from all three tabs. A second `make deploy` makes all three re-run on their own, with the new build id visible in the ledger.
4. `make report` writes three fingerprints and shows a verdict for every §18 row:
   - S1: `pass` or `fail` per web browser, overall `unverified` because the desktop app, Android and iOS are missing;
   - S15: `deferred`;
   - every other row: `unverified`, with "no probes yet".
5. If a browser can't launch Activities, or `S1.nested-opaque-module` fails, the findings note records the cause (CSP directive, path, header) and the next step. If the failure makes a spec impossible, the user is asked before the design doc changes.
