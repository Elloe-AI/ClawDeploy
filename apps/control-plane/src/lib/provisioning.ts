import { execFile } from "node:child_process";
import path from "node:path";
import { requireEnv } from "@/lib/config";

function repoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

function resolveScript(defaultName: string, overrideEnv?: string) {
  const override = overrideEnv ? process.env[overrideEnv] : undefined;
  if (override) return override;
  return path.join(repoRoot(), "infra", "scripts", defaultName);
}

async function runScript(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function bashCommand(): string {
  if (process.platform === "win32") {
    return process.env.BASH_PATH ?? "bash";
  }
  return "bash";
}

export async function provisionRunnerScript(options: {
  instanceId: string;
  runnerImage: string;
  cpuLimit: number;
  memoryLimitMb: number;
  runnerSecret: string;
  hostAgentUrl: string;
}) {
  const scriptPath = resolveScript("provision-runner.sh", "PROVISION_SCRIPT_PATH");
  const output = await runScript(bashCommand(), [
    scriptPath,
    "--id",
    options.instanceId,
    "--image",
    options.runnerImage,
    "--cpu",
    options.cpuLimit.toString(),
    "--memory",
    options.memoryLimitMb.toString(),
    "--host-agent-url",
    options.hostAgentUrl,
    "--shared-secret",
    requireEnv("HOST_AGENT_SHARED_SECRET"),
    "--control-plane-url",
    process.env.RUNNER_CONTROL_PLANE_URL ?? requireEnv("BASE_URL"),
    "--runner-secret",
    options.runnerSecret
  ]);
  return JSON.parse(output) as { runnerId: string; runnerPort: number };
}

export async function stopRunnerScript(options: { runnerId: string; hostAgentUrl: string }) {
  const scriptPath = resolveScript("stop-runner.sh", "STOP_SCRIPT_PATH");
  await runScript(bashCommand(), [
    scriptPath,
    "--id",
    options.runnerId,
    "--host-agent-url",
    options.hostAgentUrl,
    "--shared-secret",
    requireEnv("HOST_AGENT_SHARED_SECRET")
  ]);
}
