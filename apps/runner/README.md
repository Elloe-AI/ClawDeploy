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
INSTANCE_ID=
RUNNER_SECRET=
OPENAI_API_KEY=
FILES_DIR=/var/lib/clawdeploy/instances/local/files
```

## Resource limits and safety constraints

- max execution time, message rate, and concurrency are configured via the runner config file
- container limits enforced by Docker cgroups

Runner config file:

- located at the parent directory of `FILES_DIR` as `runner.json`
- written by the host agent when provisioning the container
- includes `controlPlaneUrl`, `hostAgentSharedSecret`, `openclawBin`, `openclawArgs`, and limit settings

## Run locally via Docker

```bash
docker build -f infra/docker/Dockerfile.runner -t clawdeploy-runner:dev .

docker run --rm \
  -e INSTANCE_ID=$INSTANCE_ID \
  -e RUNNER_SECRET=$RUNNER_SECRET \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e FILES_DIR=/var/lib/clawdeploy/instances/local/files \
  -p 8082:8082 \
  clawdeploy-runner:dev
```

## API endpoints

- `POST /execute` Execute input from the host agent
- `GET /health` Health check
