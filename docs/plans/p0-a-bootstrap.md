# P0-A: bootstrap and deploy loop

Part of [p0-spikes.md](p0-spikes.md) · Spikes: none (enabling session) · Depends on: nothing

## Goal

A monorepo where:
- `make preflight` type-checks and runs the test suite (fast-check with full shrinking, Worker tests in real workerd);
- `make deploy` puts a Worker on the dedicated spike Cloudflare account, serving a hello shell that loads inside Discord web.

Every later session builds on this loop.

## Out of scope

Durable Objects (B adds the first one), probes, auth, the `/g/*` route, Playwright (B), slash commands (J).

## Deliverables

### 1. Workspace and toolchain

- **Root `package.json`.** Private, `"type": "module"`, `"engines": { "node": ">=24" }`, workspaces `apps/*`, `packages/*`, `tools/*`.
- **Dev dependencies:**
  - `typescript`, `@cloudflare/workers-types`, `esbuild`;
  - `vitest`, `fast-check`, `@fast-check/vitest`, `@cloudflare/vitest-pool-workers`;
  - `wrangler`.

  Pin `vitest` to the range that `@cloudflare/vitest-pool-workers` supports.
- **`tsconfig.base.json`:**
  - `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`;
  - `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`;
  - `module: "ESNext"`, `moduleResolution: "Bundler"`, `target: "ES2022"`;
  - `composite: true` for project references.
- **`erasableSyntaxOnly`.** Node 24 runs `tools/*.ts` directly, and the browser builder (K) uses a type-stripper. Neither accepts `enum` or `namespace`. Closed sets are therefore string-literal unions built from `as const` arrays and matched with `switch` plus an `assertNever` helper. A non-exhaustive switch then fails `tsc`. This is how the AGENTS.md "enum types and exhaustive pattern matching" rule is applied in this codebase.
- **Root `tsconfig.json`.** References only.
- **`vitest.config.ts`** with two projects:
  - `node`: `packages/*/test`, `tools/*/test`;
  - `workers`: `apps/worker/test`, using `@cloudflare/vitest-pool-workers` with `apps/worker/wrangler.jsonc`, so tests run in real workerd with local R2.
- **`packages/testing`.** A shared fast-check setup applied by both projects: `fc.configureGlobal({ numRuns: FC_NUM_RUNS ?? 200, endOnFailure: FC_QUICK === "1" })`. Shrinking is complete unless `FC_QUICK` is set.
- **`.gitignore` additions:** `.dev.vars`, `.env.spike`, `dist/`, `.wrangler/`, `.cache/`, `test-results/`, `playwright-report/`.

### 2. Makefile (GNU Make 3.81 compatible: no `.ONESHELL`, no `$(file …)`)

| Target | Recipe |
|---|---|
| `install` | `npm ci` |
| `typecheck` | `npx tsc -b` |
| `test` | `npx vitest run` |
| `test-quick` | `FC_QUICK=1 npx vitest run` |
| `preflight` | `typecheck` then `test` |
| `build` | Build the shell (`apps/shell/build.ts`) and compute the build id |
| `dev` | Shell build in watch mode, plus `wrangler dev` |
| `deploy` | `guard-account`, `build`, then `wrangler deploy --var BUILD_ID:<id>` |
| `setup` | `guard-account`, R2 buckets, Worker secrets |

- `-include .env.spike` plus `export` loads tool credentials.
- `guard-account` fails unless `CLOUDFLARE_ACCOUNT_ID` equals `PT_SPIKE_ACCOUNT_ID`. Both come from `.env.spike`, and wrangler reads the first.

### 3. Worker (`apps/worker`)

- **`wrangler.jsonc`:**
  - name `playtest`, `main: src/index.ts`, a recent `compatibility_date`;
  - R2 bindings `BUILDS` → `pt-builds` and `PRIVATE` → `pt-private`. Both buckets exist from day one (§4.3);
  - vars `SPIKE: "1"`, `PROFILE: "no-domain"`;
  - static assets: `directory: "../shell/dist"`, `binding: "ASSETS"`, default asset-first routing (§4.3: the shell is free static assets; unmatched paths fall through to the Worker).
- **`src/config.ts`.** A pure `parseEnv(env) → Config | ConfigError`:
  - `profile: "no-domain" | "domain"`;
  - `spike: boolean`;
  - `buildId: BuildId` (branded).

  Unknown or missing values are errors, never defaults.
- **`src/route.ts`.** A pure `parseRoute(method, pathname, config) → Route`, a closed union:
  - `{ kind: "healthz" }`;
  - `{ kind: "not-found" }`;
  - `{ kind: "method-not-allowed"; allow: Method[] }`.

  Later sessions extend the union, and an exhaustive `switch` makes `tsc` point at every handler that's missing. Paths are matched as received; the `/.proxy` convention is measured in B before the router commits to one.
- **`src/index.ts`.** The `fetch` handler: parse config, parse the route, dispatch with `switch` plus `assertNever`. `GET /healthz` returns `{ buildId, profile }` as JSON with `Cache-Control: no-store`.
- **Tests:**
  - Property (node project): `parseRoute` is total, so it never throws for arbitrary method and path strings. Any path outside the route table maps to `not-found`. A known path with the wrong method maps to `method-not-allowed`, and its `allow` list contains the methods that route accepts.
  - Property: `parseEnv` accepts exactly the valid combinations and rejects every invalid profile string.
  - Integration (workers project, real workerd): `SELF.fetch("/healthz")` returns the configured build id; unknown paths give 404; a `POST /healthz` gives 405 with `Allow`; a static asset path is served by the assets binding, not the Worker.

### 4. Shell (`apps/shell`)

- **`index.html`.** No inline scripts or styles (they'd break under Discord's CSP). It links one hashed script, `assets/shell-<hash>.js`, and one hashed stylesheet.
- **`build.ts`** (esbuild):
  - bundles `src/main.ts` with `entryNames: "[name]-[hash]"`;
  - writes `index.html` from the metafile;
  - injects `PT_DISCORD_CLIENT_ID` and `PT_BUILD_ID` as `define`s;
  - writes `dist/_headers` so `/assets/*` is `public, max-age=31536000, immutable`.
- **`src/state.ts`.** A pure state machine. `ShellState` is a closed union:
  - `{ kind: "outside-discord" }`: there's no `frame_id` query parameter, because the page was opened directly;
  - `{ kind: "connecting" }`;
  - `{ kind: "ready"; platform: "desktop" | "mobile"; instanceId: string }`;
  - `{ kind: "failed"; error: string }`.

  `transition(state, event)` is exhaustive. Property test: no event sequence reaches `ready` without passing through `connecting`, and `outside-discord` is terminal.
- **`src/main.ts`.** The IO wrapper:
  - reads the query string;
  - if inside Discord, constructs `DiscordSDK(PT_DISCORD_CLIENT_ID)` from `@discord/embedded-app-sdk` and awaits `ready()`;
  - renders the state, the build id and the SDK's `platform`.

### 5. Setup tooling (`tools/setup`) and docs

- **`build-id.ts`.** `git rev-parse --short=12 HEAD`, plus `-dirty-<first 8 hex of sha256(git diff HEAD)>` when the tree is dirty. Its pure core, `formatBuildId(sha, diff?)`, is property-tested: different commits always give different ids, and a dirty tree never gives the same id as its clean commit.
- **`r2-buckets.ts`.** Idempotent: lists buckets with wrangler and creates only the missing `pt-builds` and `pt-private`.
- **`secrets.ts`.** Pushes the keys listed in `.dev.vars.example` from `.dev.vars` with `wrangler secret bulk`. In A, that's only `DISCORD_CLIENT_SECRET`, unused until C.
- **`.env.spike.example`:**
  - `PT_SPIKE_ACCOUNT_ID`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`;
  - `DISCORD_CLIENT_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_TEST_GUILD_ID`.
- **`.dev.vars.example`.** The Worker's secrets.
- **`docs/spikes/setup.md`.** The one-time manual steps, each with a check command where one exists:
  1. **Cloudflare.**
     - Create the dedicated free account and pick its `workers.dev` subdomain.
     - Create an API token from the "Edit Cloudflare Workers" template, plus Account Analytics Read (used in I).
     - Fill in `.env.spike`.
     - Check: `npx wrangler whoami` shows the spike account.
  2. **Discord.**
     - Create the application in the Developer Portal and enable Activities.
     - URL Mappings: `ROOT` → `playtest.<subdomain>.workers.dev`.
     - OAuth2: add the redirect `https://127.0.0.1`, as the Embedded App SDK flow requires.
     - Create a test server and install the app there (scopes `applications.commands`, `bot`).
     - Record who can launch an unpublished Activity (app team, testers), because the drop-in-tester mitigation in p0-spikes.md §6 depends on it.
  3. **GitHub** (needed from H). One org for the reusable workflow and the sample game, and a second org for the fork-PR path. List here which existing orgs are used.
  4. **Browsers.** Discord web in Chrome, Safari and Firefox, each logged in to the test account. Record whether each one can launch Activities at all.
- **`docs/implementation.md`.** Created with the A entry.

## Commits (in order, each with `make preflight` green)

1. `Workspace, strict TypeScript, vitest and fast-check, Makefile preflight`: root config, `packages/testing`, and `passWithNoTests` until commit 2.
2. `Worker: config and route parsing, /healthz`: `apps/worker` with property and workers-pool tests.
3. `Shell: hello Activity shell as static assets`: `apps/shell`, the state machine and its property test, build script, `_headers`.
4. `Setup tooling and guarded deploy`: `tools/setup/*`, Makefile `setup`/`deploy`/`dev`, env examples.
5. `Docs: spike setup guide and implementation log`.

## Verification

1. `make preflight` is green.
2. `make dev`, then open `http://localhost:8787/`: the shell renders `outside-discord` with the build id, and `curl localhost:8787/healthz` returns JSON.
3. After `docs/spikes/setup.md` is done: `make setup`, then `make deploy`.
   - `curl https://playtest.<subdomain>.workers.dev/healthz` shows the new build id.
   - Launching the Activity in the test server from Discord web in Chrome shows `ready`, the platform and the same build id.
   - Repeat in Safari and Firefox, and record any browser where Activities don't launch in `docs/spikes/setup.md`.
4. `CLOUDFLARE_ACCOUNT_ID=<any other id> make deploy` fails at `guard-account`.
