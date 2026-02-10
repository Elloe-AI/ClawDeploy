# Infrastructure Scripts

## provision-runner.sh

Creates or starts a runner container through the host agent.

Required arguments:

- `--id` Instance ID
- `--image` Runner image tag
- `--cpu` CPU limit
- `--memory` Memory limit (MB)
- `--host-agent-url` Host agent base URL
- `--shared-secret` Host agent shared secret
- `--control-plane-url` Control plane base URL
- `--runner-secret` Runner registration secret

Example:

```bash
./provision-runner.sh \
  --id $INSTANCE_ID \
  --image clawdeploy-runner:dev \
  --cpu 1 \
  --memory 1024 \
  --host-agent-url http://localhost:8081 \
  --shared-secret local-agent-shared-secret \
  --control-plane-url http://localhost:3000 \
  --runner-secret $RUNNER_SECRET
```

## stop-runner.sh

Stops and removes a runner container through the host agent.

Required arguments:

- `--id` Runner container name (instance ID)
- `--host-agent-url` Host agent base URL
- `--shared-secret` Host agent shared secret

Example:

```bash
./stop-runner.sh \
  --id $INSTANCE_ID \
  --host-agent-url http://localhost:8081 \
  --shared-secret local-agent-shared-secret
```

## bootstrap-host.sh

Bootstraps a DigitalOcean droplet with Docker, enables the Docker service, and opens port 8081 for the host agent.

Required environment variables:

- `CONTROL_PLANE_URL`
- `AGENT_ID`
- `AGENT_SHARED_SECRET`
- `RUNNER_IMAGE`

Example:

```bash
CONTROL_PLANE_URL=https://clawdeploy.co \
AGENT_ID=do-nyc1-01 \
AGENT_SHARED_SECRET=$AGENT_SHARED_SECRET \
RUNNER_IMAGE=clawdeploy-runner:prod \
./bootstrap-host.sh
```
