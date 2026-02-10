# Host Agent

The host agent runs on a DigitalOcean droplet and manages runner containers through the local Docker Engine. It accepts authenticated requests from the control plane.

## Purpose

- receive provisioning instructions from the control plane
- create, stop, and remove runner containers
- proxy execution requests to runner containers
- expose metrics and logs for runner containers

## Environment variables

```env
PORT=8081
STRIPE_SECRET_KEY=
OPENAI_API_KEY=
RUNNER_PORT_START=9100
RUNNER_PORT_END=9200
RUNNER_MAX_EXECUTION_TIME_MS=300000
RUNNER_MAX_MESSAGES_PER_MIN=60
RUNNER_MAX_CONCURRENCY=1
RUNNER_OPENCLAW_BIN=/usr/local/bin/openclaw
RUNNER_OPENCLAW_ARGS=
```

## API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /v1/health | Health check |
| GET | /v1/runners | List runner containers |
| POST | /v1/runners | Create a runner container |
| POST | /v1/runners/:id/start | Start a runner container |
| POST | /v1/runners/:id/stop | Stop and remove a runner container |
| DELETE | /v1/runners/:id | Remove a runner container |
| GET | /v1/runners/:id/logs | Fetch runner logs |
| POST | /v1/runners/:id/execute | Execute input via runner |
| GET | /v1/metrics | Host metrics summary |

All endpoints require the `x-clawdeploy-agent-secret` header.

## Run locally

```bash
npm --workspace apps/host-agent run dev
```

## Security assumptions

- host agent API is restricted to control plane IPs or private networking
- all requests require a shared secret derived from `STRIPE_SECRET_KEY`
- Docker socket access is limited to the host agent service
