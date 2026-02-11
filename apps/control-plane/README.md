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
- Stripe
- Telegram Bot API

## Required environment variables

```env
CONTROL_PLANE_URL=http://localhost:3000
DATABASE_URL=postgresql://clawdeploy:clawdeploy@localhost:5432/clawdeploy
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

`CONTROL_PLANE_URL` must be the public base URL used for webhook callbacks and redirects.

Session signing and token encryption keys are derived from `STRIPE_SECRET_KEY`.
Stripe webhook signatures are verified using `STRIPE_WEBHOOK_SECRET` and the `stripe-signature` header.

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
- `GET /api/instances/:id/files` List instance files
- `POST /api/instances/:id/files` Upload instance files
- `DELETE /api/instances/:id/files/:name` Delete a file
- `GET /api/instances/:id/resources` Get selected resources
- `PUT /api/instances/:id/resources` Update selected resources

### Messaging
- `POST /api/webhooks/telegram` Telegram inbound messages

### Billing
- `GET /api/billing/status` Billing status
- `POST /api/billing/checkout` Create Stripe checkout session
- `POST /api/billing/webhook` Stripe webhook handler

## File upload limits

- Max file size: 5MB per file
- Max files per instance: 20

To adjust limits, update `MAX_FILE_SIZE_BYTES` and `MAX_FILES_PER_INSTANCE` in `apps/control-plane/src/app/api/instances/[id]/files/route.ts`.
