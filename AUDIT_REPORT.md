# ClawDeploy Security Audit Report

Date: 2026-02-11
Scope: Full monorepo audit (control-plane, runner, host-agent, instance-console, infra, vendor, packages).

## Summary
Risk rating: MEDIUM

Top 5 issues:
1) Stripe webhook does not verify a Stripe signature; any caller can trigger event retrieval and processing.
2) Instance file upload has no file size or total upload limits; memory and disk exhaustion are possible for any authenticated user.
3) Rate limiting is in-memory only; limits reset on restart and are not shared across instances.
4) Auth endpoints (login/signup) have no rate limiting; brute-force risk.
5) Runtime verification blocked by Node engine mismatch (repo requires >=20.9.0; audit host is 18.14.0).

## Phase A — Repo inventory
Top-level structure (3 levels):

clawdeploy/
├── apps/
│   ├── control-plane/
│   ├── host-agent/
│   ├── instance-console/
│   ├── landing/
│   └── runner/
├── docs/
├── infra/
│   ├── docker/
│   └── scripts/
├── packages/
│   ├── crypto-utils/
│   ├── rate-limiter/
│   └── shared-types/
├── prisma/
├── vendor/
│   └── openclaw-chat-api/
├── ARCHITECTURE.md
├── README.md
├── package.json
└── package-lock.json

Workspace/package manager config:
- package.json (workspaces, engines >=20.9.0)
- package-lock.json (lockfileVersion 3)

Entry points:
- Control-plane API routes (Next route.ts handlers)
  - apps/control-plane/src/app/api/auth/*/route.ts
  - apps/control-plane/src/app/api/billing/*/route.ts
  - apps/control-plane/src/app/api/instances/**/route.ts
  - apps/control-plane/src/app/api/webhooks/telegram/route.ts
  - apps/control-plane/src/app/api/health/route.ts
- Runner HTTP server: apps/runner/src/index.ts (POST /execute)
- Host agent server: apps/host-agent/src/index.ts (HTTP /v1/*)
- Provisioning scripts: infra/scripts/bootstrap-host.sh, provision-runner.sh, stop-runner.sh
- Docker compose and Dockerfiles: infra/docker/docker-compose.yml, Dockerfile.*

Outbound requests and networking:
- Control-plane: fetch to host-agent and Telegram (apps/control-plane/src/lib/host-agent.ts, apps/control-plane/src/lib/telegram.ts)
- Runner: fetch to control-plane (apps/runner/src/index.ts)
- Host agent: fetch to runner (apps/host-agent/src/index.ts)
- Instance console: fetch to control-plane (apps/instance-console/app/page.tsx)
- Infra dev script: fetch to local control-plane (infra/scripts/dev.mjs)

Env var reads (high-level):
- Control-plane: CONTROL_PLANE_URL, DATABASE_URL, STRIPE_SECRET_KEY
- Host agent: STRIPE_SECRET_KEY, OPENAI_API_KEY, RUNNER_*
- Runner: INSTANCE_ID, RUNNER_SECRET, FILES_DIR
- Instance console: NEXT_PUBLIC_CONTROL_PLANE_URL

## Phase B — Automated scans
Commands and top hits (abbreviated):

1) Telegram leakage outside control-plane
rg -n "TELEGRAM_|api\.telegram\.org|sendMessage|setWebhook|getUpdates" .
- apps/control-plane/src/lib/telegram.ts: Telegram API usage
- apps/runner/src/index.ts: TELEGRAM_ env stripping in CLAWDEPLOY mode
- infra/scripts/dev.mjs: TELEGRAM_BOT_TOKEN/CHAT_ID (dev-only)

2) Trading/wallet/custody indicators
rg -n "(trade|order|wallet|mnemonic|privateKey|seed phrase|signTransaction|custody|executeTrade|placeOrder)" .
- Hits only in UI copy and documentation; no trading code paths found.

3) Polymarket write actions
rg -n "(POST|PUT|PATCH|DELETE).*(polymarket|poly)" .
- No hits.

4) External calls and networking
rg -n "(fetch\(|axios|node-fetch|undici|https\.request|http\.request)" .
- Control-plane: host-agent + Telegram fetch
- Runner: register/heartbeat fetch to control-plane
- Host agent: execute fetch to runner
- UI: fetch to control-plane
- Infra dev script: fetch to local control-plane

5) Secrets accidentally committed
rg -n "(sk_live|sk_test|DATABASE_URL=|STRIPE_SECRET_KEY|TELEGRAM_BOT_TOKEN|RUNNER_SECRET|OPENAI_API_KEY)" .
- Only .env.example/docs/scripts; no committed secrets found.

6) Path traversal / unsafe filesystem use
rg -n "(path\.join|path\.resolve|fs\.(read|write|create|rm)|multer|formidable)" apps infra vendor
- File operations confined to instance-scoped dirs and runner config.

7) Missing auth checks for instance routes
rg -n "/api/instances" apps/control-plane -S
- Route usage in UI/docs only; auth verified via manual review.

8) Webhook verification
rg -n "(webhook|X-Telegram|telegram).*verify|secret|token" apps/control-plane -S
- Telegram webhook checks x-telegram-bot-api-secret-token

## Phase C — Manual review (key files)
- Control-plane routes: auth, billing, instances, files, resources, execute, telegram webhook
- Control-plane libs: auth, config, crypto, host-agent, telegram, rate-limit, signal-contract
- Runner: apps/runner/src/index.ts
- Host agent: apps/host-agent/src/index.ts
- Instance console: apps/instance-console/app/page.tsx
- Infra: scripts and docker files
- Vendor: openclaw-chat-api (library-only, no code)

## Phase D — Build/typecheck
- Node runtime on audit host: v18.14.0
- Repo engine requirement: >=20.9.0 (package.json)
- Builds/typecheck not run due to engine mismatch (to avoid unsupported execution).

## Findings

| Severity | Category | File:Line | What’s wrong | Exploit/Failure scenario | Fix (minimal, specific) | Verification steps |
|---|---|---|---|---|---|---|
| MED | Billing/Webhook | apps/control-plane/src/app/api/billing/webhook/route.ts:26 | Webhook accepts arbitrary event IDs without Stripe signature verification; any caller can trigger Stripe event retrieval. | An attacker can flood the endpoint with random event IDs, causing repeated Stripe API calls and potential billing state churn on replayed events. | Require Stripe webhook signature verification (Stripe-Signature header) using a webhook secret; reject if missing/invalid. | Send a signed test webhook (Stripe CLI) and confirm 200; send unsigned and confirm 400/401. |
| MED | FS/DOS | apps/control-plane/src/app/api/instances/[id]/files/route.ts:92 | File uploads have no size or count limits; `formData()` and `arrayBuffer()` load full payloads into memory. | An authenticated user can upload very large files and exhaust memory/disk, impacting availability for all tenants. | Enforce per-file and per-request size limits before reading buffers; return 413 when exceeded. | Upload files above limit and confirm 413; upload within limit and confirm success. |
| MED | RateLimit | apps/control-plane/src/lib/rate-limit.ts:16 | Rate limiting is in-memory only; it resets on restart and is not shared across nodes. | An attacker can bypass limits by hitting multiple instances or after a restart; abuse of execution/messaging endpoints is easier. | Move limiter state to a shared store (Redis) or enforce limits at a gateway. | Run two control-plane instances and confirm limits are global. |
| MED | Auth | apps/control-plane/src/app/api/auth/login/route.ts:14 | Login/signup endpoints have no rate limiting or lockout mechanism. | Brute-force password attempts can be made at high speed, increasing account compromise risk. | Apply a limiter keyed by IP and/or email for auth routes; return 429 on exceed. | Attempt repeated logins and confirm 429 after threshold. |
| LOW | Deps | package.json:4 | Audit host runs Node 18.14.0, below engine requirement (>=20.9.0); build and typecheck could not be verified under supported runtime. | Unsupported runtime can mask compatibility bugs and security patches (Node 20 LTS). | Run CI/audit under Node >=20.9.0 and enforce engines in tooling. | `node -v` shows >=20.9.0; `npm install` has no EBADENGINE warnings. |

## Phase F — Patches applied for CRITICAL/HIGH
No CRITICAL/HIGH findings; no code changes applied.

## Phase G — Post-fix verification
Not applicable (no patches applied).

## Non-negotiable checks
- PASS: Telegram code exists only in apps/control-plane (runner only strips TELEGRAM_ env vars).
- PASS: Runner does not call Telegram and has no Telegram token handling.
- PASS: No trading/wallet/custody code found; hits are documentation/UI copy only.
- PASS: Control-plane enforces instance ownership for user-facing instance routes.
- PASS: Telegram webhook verifies secret header, rate limits, and respects kill switch.
- PASS: signal-contract validation is enforced in control-plane and runner at runtime.
- PASS: File uploads are instance-scoped and path traversal is blocked by safe file name checks.
- PASS: No committed secrets found; logs do not include tokens by inspection.
