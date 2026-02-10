import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(root, "apps", "control-plane", ".env"));
loadEnvFile(path.join(root, "apps", "host-agent", ".env"));

async function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with ${code}`));
    });
  });
}

async function waitFor(url, label) {
  const timeoutAt = Date.now() + 60_000;
  while (Date.now() < timeoutAt) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

function startService(cmd, args, label) {
  const child = spawn(cmd, args, { stdio: "inherit" });
  child.on("exit", (code) => {
    console.error(`${label} exited with code ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

async function main() {
  console.log("Starting dependencies...");
  await run("docker", ["compose", "-f", path.join("infra", "docker", "docker-compose.yml"), "up", "-d"]);

  console.log("Running migrations...");
  await run("npx", ["prisma", "migrate", "deploy"]);

  if (!process.env.HOST_AGENT_URL || !process.env.HOST_CAPACITY_CPU || !process.env.HOST_CAPACITY_MEMORY_MB) {
    throw new Error("HOST_AGENT_URL, HOST_CAPACITY_CPU, and HOST_CAPACITY_MEMORY_MB are required for seeding");
  }

  console.log("Seeding host record...");
  await run("node", [path.join("prisma", "seed.mjs")]);

  console.log("Starting control plane and host agent...");
  startService("npm", ["--workspace", "apps/control-plane", "run", "dev"], "control-plane");
  startService("npm", ["--workspace", "apps/host-agent", "run", "dev"], "host-agent");

  await waitFor("http://localhost:3000/api/health", "control-plane");
  await waitFor("http://localhost:8081/v1/health", "host-agent");

  const email = process.env.DEV_EMAIL;
  const password = process.env.DEV_PASSWORD;
  if (!email || !password) {
    throw new Error("DEV_EMAIL and DEV_PASSWORD are required for integration setup");
  }

  console.log("Creating or logging in user...");
  const signup = await fetch("http://localhost:3000/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  let authResponse = signup;
  if (!signup.ok) {
    authResponse = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  }

  if (!authResponse.ok) {
    const text = await authResponse.text();
    throw new Error(`Auth failed: ${text}`);
  }

  const rawCookie = authResponse.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("Auth cookie missing");
  }
  const cookie = rawCookie.split(";")[0];

  console.log("Creating instance...");
  const createInstance = await fetch("http://localhost:3000/api/instances", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({})
  });

  const createPayload = await createInstance.json();
  if (!createInstance.ok) {
    throw new Error(`Instance creation failed: ${createPayload.message ?? "unknown"}`);
  }

  const instanceId = createPayload.instance.id;
  console.log(`Instance ${instanceId} created. Waiting for runner...`);

  const timeoutAt = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < timeoutAt) {
    const statusRes = await fetch(`http://localhost:3000/api/instances/${instanceId}`, {
      headers: { cookie }
    });
    const statusPayload = await statusRes.json();
    if (statusRes.ok && statusPayload.instance?.effectiveStatus === "running") {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!ready) {
    throw new Error("Runner did not register in time");
  }

  console.log("Runner registered. Setting up Telegram...");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required to complete Telegram setup");
  }

  const telegramRes = await fetch(`http://localhost:3000/api/instances/${instanceId}/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ botToken, chatId })
  });
  const telegramPayload = await telegramRes.json();
  if (!telegramRes.ok) {
    throw new Error(`Telegram setup failed: ${telegramPayload.message ?? "unknown"}`);
  }

  console.log("Integration path complete. Control plane and host agent are running.");
  console.log("Press Ctrl+C to stop.");
  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
