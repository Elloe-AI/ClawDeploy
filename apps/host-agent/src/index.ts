import express from "express";
import { z } from "zod";
import { execFile } from "node:child_process";
import net from "node:net";

const app = express();
app.use(express.json({ limit: "1mb" }));

const port = Number(process.env.PORT ?? "8081");
const sharedSecret = process.env.AGENT_SHARED_SECRET;
if (!sharedSecret) {
  throw new Error("AGENT_SHARED_SECRET is required");
}

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
    if (process.env.RUNNER_MAX_EXECUTION_TIME_MS) {
      extraEnv.push("-e", `MAX_EXECUTION_TIME_MS=${process.env.RUNNER_MAX_EXECUTION_TIME_MS}`);
    }
    if (process.env.RUNNER_MAX_MESSAGES_PER_MIN) {
      extraEnv.push("-e", `MAX_MESSAGES_PER_MIN=${process.env.RUNNER_MAX_MESSAGES_PER_MIN}`);
    }
    if (process.env.RUNNER_MAX_CONCURRENCY) {
      extraEnv.push("-e", `MAX_CONCURRENCY=${process.env.RUNNER_MAX_CONCURRENCY}`);
    }
    if (process.env.RUNNER_OPENCLAW_BIN) {
      extraEnv.push("-e", `OPENCLAW_BIN=${process.env.RUNNER_OPENCLAW_BIN}`);
    }
    if (process.env.RUNNER_OPENCLAW_ARGS) {
      extraEnv.push("-e", `OPENCLAW_ARGS=${process.env.RUNNER_OPENCLAW_ARGS}`);
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
      "-e",
      `CONTROL_PLANE_URL=${controlPlaneUrl}`,
      "-e",
      `INSTANCE_ID=${instanceId}`,
      "-e",
      `RUNNER_SECRET=${runnerSecret}`,
      "-e",
      `HOST_AGENT_SHARED_SECRET=${sharedSecret}`,
      "-e",
      `CLAWDEPLOY_MODE=${process.env.CLAWDEPLOY_MODE ?? "true"}`,
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
