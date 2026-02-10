#!/usr/bin/env bash
set -euo pipefail

ID=""
HOST_AGENT_URL=""
SHARED_SECRET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --id)
      ID="$2"
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
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac

done

if [[ -z "$ID" || -z "$HOST_AGENT_URL" || -z "$SHARED_SECRET" ]]; then
  echo "Missing required arguments" >&2
  exit 1
fi

response=$(curl -sS -w "\n%{http_code}" \
  -X POST "$HOST_AGENT_URL/v1/runners/$ID/stop" \
  -H "x-clawdeploy-agent-secret: $SHARED_SECRET")

body=$(echo "$response" | sed '$d')
status=$(echo "$response" | tail -n 1)

if [[ "$status" != "200" ]]; then
  echo "Host agent stop failed ($status): $body" >&2
  exit 1
fi

echo "$body"
