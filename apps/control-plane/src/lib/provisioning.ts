import { execFile } from "node:child_process";
import path from "node:path";
import { deriveSecret, getControlPlaneUrl } from "@/lib/config";

function repoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

function resolveScript(defaultName: string) {
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
  const scriptPath = resolveScript("provision-runner.sh");
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
    deriveSecret("host-agent"),
    "--control-plane-url",
    getControlPlaneUrl(),
    "--runner-secret",
    options.runnerSecret
  ]);
  return JSON.parse(output) as { runnerId: string; runnerPort: number };
}

export async function stopRunnerScript(options: { runnerId: string; hostAgentUrl: string }) {
  const scriptPath = resolveScript("stop-runner.sh");
  await runScript(bashCommand(), [
    scriptPath,
    "--id",
    options.runnerId,
    "--host-agent-url",
    options.hostAgentUrl,
    "--shared-secret",
    deriveSecret("host-agent")
  ]);
}
