# Docker

## Dockerfiles

- `Dockerfile.control-plane` builds the Next.js control plane
- `Dockerfile.host-agent` builds the host agent service
- `Dockerfile.runner` builds the OpenClaw runner

## Build and tag images

```bash
docker build -f infra/docker/Dockerfile.control-plane -t clawdeploy-control-plane:dev .
docker build -f infra/docker/Dockerfile.host-agent -t clawdeploy-host-agent:dev .
docker build -f infra/docker/Dockerfile.runner -t clawdeploy-runner:dev .
```

## Development vs production usage

- development uses local image builds and `docker compose` for Postgres
- production builds run in CI and are pushed to a registry
- the host agent pulls the runner image by tag when provisioning containers

## Docker Compose

`infra/docker/docker-compose.yml` starts Postgres for local development.

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```
