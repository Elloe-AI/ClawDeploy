#!/usr/bin/env bash
set -euo pipefail

CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-}"
AGENT_ID="${AGENT_ID:-}"
AGENT_SHARED_SECRET="${AGENT_SHARED_SECRET:-}"
RUNNER_IMAGE="${RUNNER_IMAGE:-}"

if [[ -z "$CONTROL_PLANE_URL" || -z "$AGENT_ID" || -z "$AGENT_SHARED_SECRET" || -z "$RUNNER_IMAGE" ]]; then
  echo "CONTROL_PLANE_URL, AGENT_ID, AGENT_SHARED_SECRET, and RUNNER_IMAGE must be set" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 8081/tcp
  ufw --force enable
fi

echo "Host bootstrapped with Docker. Configure the host agent with AGENT_ID=$AGENT_ID and CONTROL_PLANE_URL=$CONTROL_PLANE_URL."
