# ClawDeploy Documentation

- [Architecture Overview](#architecture-overview)
- [Development Setup](#development-setup)
- [Deployment Model (DigitalOcean)](#deployment-model-digitalocean)
- [Messaging Flow](#messaging-flow)
- [Security Model](#security-model)
- [Scaling Strategy](#scaling-strategy)

## Architecture Overview

ClawDeploy is composed of three runtime components:

- Control plane (Next.js web + API)
- Host agent (Docker management on DigitalOcean droplets)
- Runner containers (OpenClaw execution)

Traffic flow:

```
Telegram -> Control Plane -> Host Agent -> Runner -> OpenClaw
```

## Development Setup

- Start Postgres using `infra/docker/docker-compose.yml`
- Configure `apps/control-plane/.env` and `apps/host-agent/.env`
- Run Prisma migrations and seed a host record
- Start control plane and host agent

See `infra/scripts/dev.mjs` for an integration path that provisions a runner and connects Telegram.

## Deployment Model (DigitalOcean)

- Each DigitalOcean droplet runs the host agent and Docker Engine
- The control plane provisions runner containers on those droplets
- Runners call back to the control plane for registration and heartbeats

Production base URL: `https://clawdeploy.co`

## Messaging Flow

- Telegram sends webhook updates to `/api/webhooks/telegram`
- The control plane maps `chat_id` to an instance
- The control plane forwards input to the runner via the host agent
- Runner output is sent back to Telegram using the bot token

## Security Model

- control plane authenticates users with signed session tokens
- host agent requests require `x-clawdeploy-agent-secret`
- runner execution requires `x-host-agent-secret`
- Telegram webhooks require the secret token configured at webhook setup
- Stripe webhooks are verified with `stripe-signature` using `STRIPE_WEBHOOK_SECRET`
- Instance file uploads are limited to 5MB per file and 20 files per instance

## Scaling Strategy

- Add droplets to increase host capacity
- Increase runner container count per host within CPU/memory limits
- Enforce API and message rate limits in the control plane process
- Use billing status to gate provisioning and message execution
