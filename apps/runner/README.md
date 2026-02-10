# Runner

The runner is a containerized process that executes OpenClaw requests. It only communicates with the control plane and host agent.

## Purpose

- receive execution requests from the host agent
- invoke the OpenClaw binary with bounded resources
- return output to the control plane

Runners do not talk directly to messaging platforms.

## Execution lifecycle

1. Runner boots and registers with the control plane
2. Runner sends heartbeats every 30 seconds
3. Host agent forwards an execution request
4. Runner invokes OpenClaw and captures output
5. Runner returns result to the host agent

## Environment variables

```env
NODE_ENV=development
PORT=8082
CONTROL_PLANE_URL=http://localhost:3000
INSTANCE_ID=
RUNNER_SECRET=
HOST_AGENT_SHARED_SECRET=local-agent-shared-secret
CLAWDEPLOY_MODE=true
OPENCLAW_BIN=/usr/local/bin/openclaw
OPENCLAW_ARGS=
MAX_EXECUTION_TIME_MS=300000
MAX_MESSAGES_PER_MIN=60
MAX_CONCURRENCY=1
LOG_LEVEL=info
```

## Resource limits and safety constraints

- max execution time enforced by `MAX_EXECUTION_TIME_MS`
- per-minute request cap enforced by `MAX_MESSAGES_PER_MIN`
- concurrency bounded by `MAX_CONCURRENCY`
- container limits enforced by Docker cgroups

## Run locally via Docker

```bash
docker build -f infra/docker/Dockerfile.runner -t clawdeploy-runner:dev .

docker run --rm \
  -e CONTROL_PLANE_URL=http://localhost:3000 \
  -e INSTANCE_ID=$INSTANCE_ID \
  -e RUNNER_SECRET=$RUNNER_SECRET \
  -e HOST_AGENT_SHARED_SECRET=local-agent-shared-secret \
  -e OPENCLAW_BIN=/usr/local/bin/openclaw \
  -p 8082:8082 \
  clawdeploy-runner:dev
```

## API endpoints

- `POST /execute` Execute input from the host agent
- `GET /health` Health check
