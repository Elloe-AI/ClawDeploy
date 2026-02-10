# Control Plane

The control plane is a Next.js application that serves the web UI and API for ClawDeploy. It owns authentication, instance lifecycle, messaging, and billing enforcement.

## Responsibilities

- user authentication and session management
- instance creation and deletion
- message forwarding to runners
- billing and plan enforcement
- kill switch handling
- Telegram webhook processing

## Tech stack

- Next.js + TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- Stripe
- Telegram Bot API

## Required environment variables

```env
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
RUNNER_CONTROL_PLANE_URL=http://host.docker.internal:3000
DATABASE_URL=postgresql://clawdeploy:clawdeploy@localhost:5432/clawdeploy
REDIS_URL=redis://localhost:6379
SESSION_SECRET=local-session-secret-32-bytes-minimum
DATA_ENCRYPTION_KEY=Z3Jhbm1hY2FkZW5jZXJlbmNyeXB0aW9ua2V5MTIzNDU2Nzg5MA==
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
HOST_AGENT_URL=http://localhost:8081
HOST_AGENT_SHARED_SECRET=local-agent-shared-secret
RUNNER_IMAGE=clawdeploy-runner:dev
DEFAULT_RUNNER_CPU_LIMIT=1
DEFAULT_RUNNER_MEMORY_LIMIT_MB=1024
RATE_LIMIT_MESSAGES_PER_MINUTE=60
RATE_LIMIT_API_PER_MINUTE=120
MAX_EXECUTION_TIME_MS=300000
RUNNER_HEARTBEAT_TIMEOUT_MS=90000
TELEGRAM_WEBHOOK_BASE_URL=http://localhost:3000
TELEGRAM_API_BASE_URL=https://api.telegram.org
LOG_LEVEL=info
```

`RUNNER_CONTROL_PLANE_URL` must be reachable from runner containers (use `host.docker.internal` on macOS/Windows or a host IP on Linux).

## Run locally

```bash
npm --workspace apps/control-plane run dev
```

Production base URL: `https://clawdeploy.co`

## Main API endpoints

### Authentication
- `POST /api/auth/signup` Create user and workspace
- `POST /api/auth/login` Authenticate and start session
- `POST /api/auth/logout` End session
- `GET /api/auth/me` Return current user and workspace

### Instances
- `POST /api/instances` Create instance and provision runner
- `GET /api/instances` List instances for workspace
- `GET /api/instances/:id` Instance detail with host, channels, and events
- `POST /api/instances/:id/kill` Enable kill switch and stop runner
- `POST /api/instances/register` Runner registration
- `POST /api/instances/:id/heartbeat` Runner heartbeat
- `POST /api/instances/:id/execute` Execute input on a runner
- `POST /api/instances/:id/telegram` Connect Telegram bot and set webhook

### Messaging
- `POST /api/webhooks/telegram` Telegram inbound messages

### Billing
- `GET /api/billing/status` Billing status
- `POST /api/billing/checkout` Create Stripe checkout session
- `POST /api/billing/webhook` Stripe webhook handler
