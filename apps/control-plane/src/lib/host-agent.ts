import { requireEnv } from "@/lib/config";
import { logError } from "@/lib/logger";

export type ProvisionRunnerResult = {
  runnerId: string;
  runnerPort: number;
};

export type RunnerMessage = {
  type: string;
  text: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

const agentSecret = () => requireEnv("HOST_AGENT_SHARED_SECRET");

export async function provisionRunner(options: {
  hostBaseUrl: string;
  instanceId: string;
  runnerImage: string;
  cpuLimit: number;
  memoryLimitMb: number;
  controlPlaneUrl: string;
  runnerSecret: string;
}): Promise<ProvisionRunnerResult> {
  const response = await fetch(`${options.hostBaseUrl}/v1/runners`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-clawdeploy-agent-secret": agentSecret()
    },
    body: JSON.stringify({
      instanceId: options.instanceId,
      runnerImage: options.runnerImage,
      cpuLimit: options.cpuLimit,
      memoryLimitMb: options.memoryLimitMb,
      controlPlaneUrl: options.controlPlaneUrl,
      runnerSecret: options.runnerSecret
    })
  });

  if (!response.ok) {
    const text = await response.text();
    logError("host_agent.provision_failed", { status: response.status, body: text });
    throw new Error(`Host agent provisioning failed (${response.status})`);
  }

  const payload = (await response.json()) as ProvisionRunnerResult;
  if (!payload.runnerId || !payload.runnerPort) {
    throw new Error("Host agent response missing runner details");
  }
  return payload;
}

export async function stopRunner(hostBaseUrl: string, runnerId: string) {
  const response = await fetch(`${hostBaseUrl}/v1/runners/${runnerId}/stop`, {
    method: "POST",
    headers: {
      "x-clawdeploy-agent-secret": agentSecret()
    }
  });

  if (!response.ok) {
    const text = await response.text();
    logError("host_agent.stop_failed", { status: response.status, body: text });
    throw new Error(`Host agent stop failed (${response.status})`);
  }
}

export async function executeRunner(options: {
  hostBaseUrl: string;
  runnerId: string;
  input: string;
  timeoutMs: number;
}): Promise<{ output: string; messages: RunnerMessage[]; exitCode: number; durationMs: number; requestId: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(`${options.hostBaseUrl}/v1/runners/${options.runnerId}/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-clawdeploy-agent-secret": agentSecret()
      },
      body: JSON.stringify({ input: options.input, timeoutMs: options.timeoutMs }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      logError("host_agent.execute_failed", { status: response.status, body: text });
      throw new Error(`Runner execute failed (${response.status})`);
    }

    const payload = (await response.json()) as {
      output?: string;
      messages?: RunnerMessage[];
      exitCode: number;
      durationMs: number;
      requestId: string;
    };

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const output =
      payload.output ??
      messages
        .map((message) => (typeof message.text === "string" ? message.text : ""))
        .filter(Boolean)
        .join("\n");

    return {
      output,
      messages,
      exitCode: payload.exitCode,
      durationMs: payload.durationMs,
      requestId: payload.requestId
    };
  } finally {
    clearTimeout(timeout);
  }
}
