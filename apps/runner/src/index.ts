import express from "express";
import { z } from "zod";
import { spawn } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = 8082;
const instanceId = process.env.INSTANCE_ID;
const runnerSecret = process.env.RUNNER_SECRET;
const filesDir = process.env.FILES_DIR;

const configSchema = z.object({
  controlPlaneUrl: z.string().url(),
  hostAgentSharedSecret: z.string().min(16),
  openclawBin: z.string().min(1).optional(),
  openclawArgs: z.array(z.string()).optional(),
  maxExecutionMs: z.number().int().positive().optional(),
  maxMessagesPerMin: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().positive().optional()
});

type RunnerConfig = z.infer<typeof configSchema>;

function loadRunnerConfig(baseFilesDir: string): RunnerConfig {
  const instanceRoot = path.dirname(baseFilesDir);
  const configPath = path.join(instanceRoot, "runner.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Runner config missing at ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Runner config is invalid");
  }
  return result.data;
}

if (!instanceId || !runnerSecret || !filesDir) {
  throw new Error("INSTANCE_ID, RUNNER_SECRET, and FILES_DIR are required");
}

const runnerConfig = loadRunnerConfig(filesDir);
const controlPlaneUrl = runnerConfig.controlPlaneUrl.replace(/\/$/, "");
const hostAgentSecret = runnerConfig.hostAgentSharedSecret;
const openclawBin = runnerConfig.openclawBin ?? "openclaw";
const openclawArgs = runnerConfig.openclawArgs ?? [];
const clawDeployMode = true;

if (clawDeployMode) {
  // OpenClaw Telegram hooks rely on TELEGRAM_* env vars. Strip them in ClawDeploy mode.
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("TELEGRAM_")) {
      delete process.env[key];
    }
  }
}

const maxExecutionMs = runnerConfig.maxExecutionMs ?? 300000;
const maxMessagesPerMin = runnerConfig.maxMessagesPerMin ?? 60;
const maxConcurrency = runnerConfig.maxConcurrency ?? 1;

let activeRequests = 0;
const recentRequests: number[] = [];

const executeSchema = z.object({
  input: z.string().min(1),
  timeoutMs: z.number().optional()
});

function pruneRequests() {
  const cutoff = Date.now() - 60_000;
  while (recentRequests.length > 0 && recentRequests[0] < cutoff) {
    recentRequests.shift();
  }
}

const marketStateSchema = z.object({
  market_id: z.string().min(1),
  question: z.string().min(1),
  outcomes: z.object({
    YES: z.object({ price: z.number().finite() }),
    NO: z.object({ price: z.number().finite() })
  }),
  volume: z.number().finite(),
  liquidity: z.number().finite(),
  end_time: z.string().datetime(),
  timestamp: z.string().datetime(),
  source: z.literal("polymarket")
});

const agentInputSchema = z.object({
  context: z.object({
    instance_id: z.string().min(1),
    execution_id: z.string().min(1),
    timestamp: z.string().datetime()
  }),
  market_state: marketStateSchema,
  constraints: z.object({
    mode: z.literal("signal_only"),
    max_messages_per_min: z.number().int().positive()
  })
});

const signalOutputSchema = z.object({
  signal: z.enum(["BUY_YES", "BUY_NO", "HOLD"]),
  confidence: z.number().finite(),
  reasoning: z.string().min(1),
  warnings: z.array(z.string()).default([])
});

type AgentInput = z.infer<typeof agentInputSchema>;
type SignalOutput = z.infer<typeof signalOutputSchema>;

// OpenClaw emits structured output. Normalize to a consistent message shape for the control plane.
type StructuredMessage = {
  type: string;
  text: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

function parseAgentInput(raw: string): AgentInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Agent input must be JSON");
  }
  const result = agentInputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Agent input does not match required contract");
  }
  return result.data;
}

function parseSignalOutput(stdout: string, stderr: string): SignalOutput | null {
  const trimmed = stdout.trim() || stderr.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const result = signalOutputSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

function buildOpenClawEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (clawDeployMode) {
    // OpenClaw Telegram hooks read TELEGRAM_* env vars. Strip them in ClawDeploy mode.
    for (const key of Object.keys(env)) {
      if (key.startsWith("TELEGRAM_")) {
        delete env[key];
      }
    }
  }
  env.CLAWDEPLOY_MODE = clawDeployMode ? "true" : "false";
  return env;
}

async function registerRunner() {
  const response = await fetch(`${controlPlaneUrl}/api/instances/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      instanceId,
      runnerSecret,
      runnerVersion: "0.1.0"
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Registration failed: ${text}`);
  }
}

async function sendHeartbeat() {
  await fetch(`${controlPlaneUrl}/api/instances/${instanceId}/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      runnerSecret,
      requestsProcessed: recentRequests.length
    })
  });
}

function startRegistrationLoop() {
  const attempt = async () => {
    try {
      await registerRunner();
      console.log(JSON.stringify({ level: "info", event: "runner.registered" }));
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "runner.register_failed", message: (error as Error).message }));
      setTimeout(attempt, 5000);
    }
  };
  attempt();
}

startRegistrationLoop();
setInterval(() => {
  sendHeartbeat().catch((error) => {
    console.error(JSON.stringify({ level: "error", event: "runner.heartbeat_failed", message: (error as Error).message }));
  });
}, 30_000);

app.post("/execute", async (req, res) => {
  const secret = req.header("x-host-agent-secret");
  if (secret !== hostAgentSecret) {
    res.status(401).json({ error: "unauthorized", message: "Invalid host agent secret" });
    return;
  }

  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Invalid execute payload" });
    return;
  }

  let agentInput: AgentInput;
  try {
    agentInput = parseAgentInput(parsed.data.input);
  } catch (error) {
    res.status(400).json({ error: "invalid_agent_input", message: (error as Error).message });
    return;
  }

  pruneRequests();
  if (recentRequests.length >= maxMessagesPerMin) {
    res.status(429).json({ error: "rate_limited", message: "Runner rate limit exceeded" });
    return;
  }

  if (activeRequests >= maxConcurrency) {
    res.status(429).json({ error: "busy", message: "Runner is at max concurrency" });
    return;
  }

  if (!openclawBin) {
    res.status(500).json({ error: "openclaw_missing", message: "OpenClaw binary is not configured" });
    return;
  }

  try {
    await fs.promises.access(openclawBin, fs.constants.X_OK);
  } catch {
    res.status(500).json({ error: "openclaw_missing", message: `OpenClaw binary not found at ${openclawBin}` });
    return;
  }

  const requestId = crypto.randomUUID();
  const timeoutMs = Math.min(parsed.data.timeoutMs ?? maxExecutionMs, maxExecutionMs);
  const args = openclawArgs;
  const startedAt = Date.now();
  let responded = false;
  let timedOut = false;

  activeRequests += 1;
  recentRequests.push(Date.now());

  const child = spawn(openclawBin, args, { stdio: ["pipe", "pipe", "pipe"], env: buildOpenClawEnv() });
  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);

  child.on("error", (error) => {
    clearTimeout(timeout);
    activeRequests -= 1;
    if (!responded) {
      responded = true;
      res.status(500).json({ error: "openclaw_error", message: error.message, requestId });
    }
  });

  child.on("close", (code) => {
    clearTimeout(timeout);
    activeRequests -= 1;
    const durationMs = Date.now() - startedAt;
    const exitCode = typeof code === "number" ? code : 1;

    if (!responded) {
      responded = true;
      if (timedOut) {
        res.status(504).json({
          error: "execution_timeout",
          message: `Execution exceeded ${timeoutMs}ms`,
          requestId
        });
      } else {
        const signalOutput = parseSignalOutput(stdout, stderr);
        if (!signalOutput) {
          res.json({
            requestId,
            output: "",
            messages: [],
            exitCode,
            durationMs
          });
          return;
        }

        const messages: StructuredMessage[] = [
          {
            type: "signal",
            text: signalOutput.signal,
            confidence: signalOutput.confidence,
            metadata: { reasoning: signalOutput.reasoning, warnings: signalOutput.warnings }
          }
        ];
        const output = JSON.stringify(signalOutput);
        res.json({
          requestId,
          output,
          messages,
          exitCode,
          durationMs
        });
      }
    }
  });

  child.stdin.write(JSON.stringify(agentInput));
  child.stdin.end();
});

app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", event: "runner.started", port }));
});
