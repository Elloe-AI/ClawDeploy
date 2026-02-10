import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { verifyRunnerSecret } from "@/lib/crypto";
import { logInfo } from "@/lib/logger";

const schema = z.object({
  instanceId: z.string().uuid(),
  runnerSecret: z.string().min(16),
  runnerVersion: z.string().optional()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid registration payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const { instanceId, runnerSecret, runnerVersion } = parsed.data;
  const instance = await prisma.instance.findUnique({ where: { id: instanceId } });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }
  if (instance.killEnabled) {
    return jsonError("instance_disabled", "Kill switch is enabled", 403);
  }

  const valid = verifyRunnerSecret(runnerSecret, instance.runnerSecretHash, instance.runnerSecretSalt);
  if (!valid) {
    return jsonError("unauthorized", "Invalid runner secret", 401);
  }

  await prisma.instance.update({
    where: { id: instance.id },
    data: { status: "running", lastHeartbeatAt: new Date() }
  });

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "runner_registered",
      message: runnerVersion ? `Runner registered (${runnerVersion})` : "Runner registered"
    }
  });

  logInfo("runner.register", { instanceId: instance.id });

  return jsonOk({
    instance: {
      id: instance.id,
      status: "running"
    }
  });
}
