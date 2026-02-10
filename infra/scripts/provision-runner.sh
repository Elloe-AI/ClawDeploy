#!/usr/bin/env bash
set -euo pipefail

ID=""
IMAGE=""
CPU=""
MEMORY=""
HOST_AGENT_URL=""
SHARED_SECRET=""
CONTROL_PLANE_URL=""
RUNNER_SECRET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      ID="$2"
      shift 2
      ;;
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --cpu)
      CPU="$2"
      shift 2
      ;;
    --memory)
      MEMORY="$2"
      shift 2
      ;;
    --host-agent-url)
      HOST_AGENT_URL="$2"
      shift 2
      ;;
    --shared-secret)
      SHARED_SECRET="$2"
      shift 2
      ;;
    --control-plane-url)
      CONTROL_PLANE_URL="$2"
      shift 2
      ;;
    --runner-secret)
      RUNNER_SECRET="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac

done

if [[ -z "$ID" || -z "$IMAGE" || -z "$CPU" || -z "$MEMORY" || -z "$HOST_AGENT_URL" || -z "$SHARED_SECRET" || -z "$CONTROL_PLANE_URL" || -z "$RUNNER_SECRET" ]]; then
  echo "Missing required arguments" >&2
  exit 1
fi

response=$(curl -sS -w "\n%{http_code}" \
  -X POST "$HOST_AGENT_URL/v1/runners" \
  -H "content-type: application/json" \
  -H "x-clawdeploy-agent-secret: $SHARED_SECRET" \
  -d "{\"instanceId\":\"$ID\",\"runnerImage\":\"$IMAGE\",\"cpuLimit\":$CPU,\"memoryLimitMb\":$MEMORY,\"controlPlaneUrl\":\"$CONTROL_PLANE_URL\",\"runnerSecret\":\"$RUNNER_SECRET\"}")

body=$(echo "$response" | sed '$d')
status=$(echo "$response" | tail -n 1)

if [[ "$status" != "200" ]]; then
  echo "Host agent provisioning failed ($status): $body" >&2
  exit 1
fi

echo "$body"
