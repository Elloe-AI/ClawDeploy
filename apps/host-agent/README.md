# Host Agent

The host agent runs on a DigitalOcean droplet and manages runner containers through the local Docker Engine. It accepts authenticated requests from the control plane.

## Purpose

- receive provisioning instructions from the control plane
- create, stop, and remove runner containers
- proxy execution requests to runner containers
- expose metrics and logs for runner containers

## Environment variables

```env
NODE_ENV=development
PORT=8081
AGENT_ID=local-host
AGENT_SHARED_SECRET=local-agent-shared-secret
RUNNER_IMAGE=clawdeploy-runner:dev
RUNNER_CPU_LIMIT=1
RUNNER_MEMORY_LIMIT_MB=1024
RUNNER_PORT_START=9100
RUNNER_PORT_END=9200
CLAWDEPLOY_MODE=true
RUNNER_MAX_EXECUTION_TIME_MS=300000
RUNNER_MAX_MESSAGES_PER_MIN=60
RUNNER_MAX_CONCURRENCY=1
RUNNER_OPENCLAW_BIN=/usr/local/bin/openclaw
RUNNER_OPENCLAW_ARGS=
CONTROL_PLANE_URL=http://localhost:3000
LOG_LEVEL=info
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
- all requests require a shared secret
- Docker socket access is limited to the host agent service
