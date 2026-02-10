import express from "express";
import { z } from "zod";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? "8081");
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  throw new Error("STRIPE_SECRET_KEY is required");
}
const sharedSecret = crypto.createHash("sha256").update(`host-agent:${stripeSecret}`).digest("hex");

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = req.header("x-clawdeploy-agent-secret");
  if (!secret || secret !== sharedSecret) {
    res.status(401).json({ error: "unauthorized", message: "Invalid agent secret" });
    return;
  }
  next();
}

function docker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("docker", args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function containerName(instanceId: string) {
  return `clawdeploy-runner-${instanceId}`;
}

function instanceFilesDir(instanceId: string) {
  return path.join("/var/lib/clawdeploy/instances", instanceId, "files");
}

function runnerConfigPath(filesDir: string) {
  const instanceRoot = path.dirname(filesDir);
  return path.join(instanceRoot, "runner.json");
}

function parseOpenClawArgs(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      return undefined;
    }
  }
  return trimmed.split(" ").filter((part) => part.length > 0);
}

async function writeRunnerConfig(filesDir: string, controlPlaneUrl: string) {
  const config: {
    controlPlaneUrl: string;
    hostAgentSharedSecret: string;
    openclawBin?: string;
    openclawArgs?: string[];
    maxExecutionMs?: number;
    maxMessagesPerMin?: number;
    maxConcurrency?: number;
  } = {
    controlPlaneUrl,
    hostAgentSharedSecret: sharedSecret
  };

  if (process.env.RUNNER_OPENCLAW_BIN) {
    config.openclawBin = process.env.RUNNER_OPENCLAW_BIN;
  }

  const parsedArgs = parseOpenClawArgs(process.env.RUNNER_OPENCLAW_ARGS);
  if (parsedArgs && parsedArgs.length > 0) {
    config.openclawArgs = parsedArgs;
  }

  const maxExecutionMs = Number(process.env.RUNNER_MAX_EXECUTION_TIME_MS);
  if (Number.isFinite(maxExecutionMs) && maxExecutionMs > 0) {
    config.maxExecutionMs = maxExecutionMs;
  }

  const maxMessagesPerMin = Number(process.env.RUNNER_MAX_MESSAGES_PER_MIN);
  if (Number.isFinite(maxMessagesPerMin) && maxMessagesPerMin > 0) {
    config.maxMessagesPerMin = maxMessagesPerMin;
  }

  const maxConcurrency = Number(process.env.RUNNER_MAX_CONCURRENCY);
  if (Number.isFinite(maxConcurrency) && maxConcurrency > 0) {
    config.maxConcurrency = maxConcurrency;
  }

  const configPath = runnerConfigPath(filesDir);
  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2));
}

async function isPortFree(portNumber: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(portNumber, "127.0.0.1");
  });
}

async function allocatePort(start: number, end: number): Promise<number> {
  for (let portNumber = start; portNumber <= end; portNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const free = await isPortFree(portNumber);
    if (free) return portNumber;
  }
  throw new Error("No available runner ports");
}

async function getContainerId(name: string): Promise<string | null> {
  const output = await docker(["ps", "-a", "--filter", `name=^/${name}$`, "--format", "{{.ID}}"]).catch(() => "");
  return output ? output.split("\n")[0] : null;
}

async function getContainerPort(name: string): Promise<number | null> {
  const output = await docker(["inspect", "-f", "{{(index (index .NetworkSettings.Ports \"8082/tcp\") 0).HostPort}}", name]).catch(() => "");
  const portNumber = Number(output);
  return Number.isFinite(portNumber) && portNumber > 0 ? portNumber : null;
}

app.get("/v1/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/v1/runners", requireAuth, async (_req, res) => {
  try {
    const output = await docker([
      "ps",
      "-a",
      "--filter",
      "label=clawdeploy.runner=true",
      "--format",
      "{{.ID}} {{.Names}} {{.Status}}"
    ]);
    const runners = output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [id, name, ...statusParts] = line.split(" ");
        return { id, name, status: statusParts.join(" ") };
      });
    res.json({ runners });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

const createSchema = z.object({
  instanceId: z.string().uuid(),
  runnerImage: z.string().min(1),
  cpuLimit: z.number().min(0.1),
  memoryLimitMb: z.number().min(128),
  controlPlaneUrl: z.string().url(),
  runnerSecret: z.string().min(16)
});

app.post("/v1/runners", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Invalid payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { instanceId, runnerImage, cpuLimit, memoryLimitMb, controlPlaneUrl, runnerSecret } = parsed.data;
  const name = containerName(instanceId);

  try {
    const filesDir = instanceFilesDir(instanceId);
    await fs.promises.mkdir(filesDir, { recursive: true });
    await writeRunnerConfig(filesDir, controlPlaneUrl);

    const existingId = await getContainerId(name);
    if (existingId) {
      const portNumber = await getContainerPort(name);
      await docker(["start", name]).catch(() => null);
      if (!portNumber) {
        res.status(500).json({ error: "runner_port_missing", message: "Runner port not found" });
        return;
      }
      res.json({ runnerId: name, runnerPort: portNumber });
      return;
    }

    const portStart = Number(process.env.RUNNER_PORT_START ?? "9100");
    const portEnd = Number(process.env.RUNNER_PORT_END ?? "9200");
    const portNumber = await allocatePort(portStart, portEnd);

    const extraEnv: string[] = [];
    if (process.env.OPENAI_API_KEY) {
      extraEnv.push("-e", `OPENAI_API_KEY=${process.env.OPENAI_API_KEY}`);
    }

    await docker([
      "run",
      "-d",
      "--name",
      name,
      "--restart",
      "unless-stopped",
      "--cpus",
      cpuLimit.toString(),
      "--memory",
      `${memoryLimitMb}m`,
      "-p",
      `127.0.0.1:${portNumber}:8082`,
      "--label",
      "clawdeploy.runner=true",
      "--label",
      `clawdeploy.instanceId=${instanceId}`,
      "-v",
      `${filesDir}:${filesDir}`,
      "-e",
      `INSTANCE_ID=${instanceId}`,
      "-e",
      `RUNNER_SECRET=${runnerSecret}`,
      "-e",
      `FILES_DIR=${filesDir}`,
      ...extraEnv,
      runnerImage
    ]);

    res.json({ runnerId: name, runnerPort: portNumber });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.post("/v1/runners/:id/start", requireAuth, async (req, res) => {
  try {
    await docker(["start", req.params.id]);
    res.json({ status: "started" });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.post("/v1/runners/:id/stop", requireAuth, async (req, res) => {
  try {
    await docker(["stop", req.params.id]);
    await docker(["rm", req.params.id]);
    res.json({ status: "stopped" });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.delete("/v1/runners/:id", requireAuth, async (req, res) => {
  try {
    await docker(["rm", "-f", req.params.id]);
    res.json({ status: "removed" });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.get("/v1/runners/:id/logs", requireAuth, async (req, res) => {
  try {
    const output = await docker(["logs", "--tail", "200", req.params.id]);
    res.json({ logs: output });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.post("/v1/runners/:id/execute", requireAuth, async (req, res) => {
  const input = typeof req.body?.input === "string" ? req.body.input : "";
  const timeoutMs = Number(req.body?.timeoutMs ?? 300000);
  if (!input) {
    res.status(400).json({ error: "invalid_request", message: "Input is required" });
    return;
  }

  try {
    const portNumber = await getContainerPort(req.params.id);
    if (!portNumber) {
      res.status(404).json({ error: "runner_not_found", message: "Runner port not found" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${portNumber}/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-host-agent-secret": sharedSecret
        },
        body: JSON.stringify({ input, timeoutMs }),
        signal: controller.signal
      });

      const payload = await response.json();
      res.status(response.status).json(payload);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    res.status(500).json({ error: "runner_execute_failed", message: (error as Error).message });
  }
});

app.get("/v1/metrics", requireAuth, async (_req, res) => {
  try {
    const output = await docker([
      "ps",
      "-a",
      "--filter",
      "label=clawdeploy.runner=true",
      "--format",
      "{{.ID}}"
    ]);
    const count = output ? output.split("\n").filter((line) => line.trim()).length : 0;
    res.json({ runnerCount: count });
  } catch (error) {
    res.status(500).json({ error: "docker_error", message: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", event: "host_agent.started", port }));
});
