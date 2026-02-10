import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { verifyRunnerSecret } from "@/lib/crypto";

const schema = z.object({
  runnerSecret: z.string().min(16),
  cpuPercent: z.number().optional(),
  memoryMb: z.number().optional(),
  requestsProcessed: z.number().optional()
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid heartbeat payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const instance = await prisma.instance.findUnique({ where: { id: params.id } });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }
  if (instance.killEnabled) {
    return jsonError("instance_disabled", "Kill switch is enabled", 403);
  }

  const valid = verifyRunnerSecret(parsed.data.runnerSecret, instance.runnerSecretHash, instance.runnerSecretSalt);
  if (!valid) {
    return jsonError("unauthorized", "Invalid runner secret", 401);
  }

  await prisma.instance.update({
    where: { id: instance.id },
    data: { lastHeartbeatAt: new Date(), status: "running" }
  });

  if (Math.random() < 0.1) {
    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "heartbeat",
        message: "Runner heartbeat",
        meta: {
          cpuPercent: parsed.data.cpuPercent,
          memoryMb: parsed.data.memoryMb,
          requestsProcessed: parsed.data.requestsProcessed
        }
      }
    });
  }

  return jsonOk({ status: "ok" });
}
