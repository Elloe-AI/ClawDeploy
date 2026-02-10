# ClawDeploy

ClawDeploy is a managed deployment system for OpenClaw. It provides a control plane (web + API), host automation for DigitalOcean droplets, and runner containers that execute OpenClaw requests.

## Problem solved

ClawDeploy removes manual container management and adds a consistent API for provisioning, messaging, and billing enforcement so a user can deploy and connect Telegram quickly.

Production base URL: `https://clawdeploy.co`

## Architecture overview

```
Telegram -> Control Plane -> Host Agent -> Runner -> OpenClaw
            |                 |
            |                 -> Docker Engine
            -> Postgres + Redis
```

- Control plane: Next.js app with API routes, billing, and message forwarding.
- Host agent: Service on DigitalOcean droplets that provisions and controls runner containers.
- Runner: Container that executes OpenClaw and reports to the control plane.

## Monorepo layout

```
clawdeploy/
├── apps/
│   ├── control-plane/      # Next.js web + API
│   ├── runner/             # OpenClaw runner process
│   └── host-agent/         # Host process on droplets
│   ├── instance-console/   # Instance console UI
│   └── landing/            # Marketing site
├── vendor/
│   ├── openclaw-chat-api/  # Vendored OpenClaw logic
│   └── openclaw-extension/ # Unused
├── infra/
│   ├── docker/             # Dockerfiles and compose
│   └── scripts/            # Provisioning and host scripts
├── packages/
│   ├── shared-types/       # Cross-service TypeScript types
│   ├── crypto-utils/       # Encryption and signing helpers
│   └── rate-limiter/       # Redis-backed rate limiter
└── docs/
```

## Local development (high level)

1. Start Postgres and Redis.
2. Configure `.env` files for the control plane and host agent.
3. Run Prisma migrations and seed the host table.
4. Start the control plane and host agent.
5. Create an instance to provision a runner.

Example:

```bash
npm install

docker compose -f infra/docker/docker-compose.yml up -d

# Set HOST_AGENT_URL, HOST_CAPACITY_CPU, HOST_CAPACITY_MEMORY_MB for seeding
npx prisma migrate deploy
HOST_AGENT_URL=http://localhost:8081 HOST_CAPACITY_CPU=4 HOST_CAPACITY_MEMORY_MB=8192 node prisma/seed.mjs

npm --workspace apps/control-plane run dev
npm --workspace apps/host-agent run dev
```

For a full integration path (including provisioning and Telegram hookup), use `npm run dev` or run `infra/scripts/dev.mjs` directly.
It expects `DEV_EMAIL`, `DEV_PASSWORD`, `HOST_AGENT_URL`, `HOST_CAPACITY_CPU`, `HOST_CAPACITY_MEMORY_MB`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_CHAT_ID`.

## Documentation

See `docs/index.md` for architecture details, deployment model, and operational notes.
