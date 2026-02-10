import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { stopRunnerScript } from "@/lib/provisioning";
import { logError, logInfo } from "@/lib/logger";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const instance = await prisma.instance.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId },
    include: { host: true }
  });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  await prisma.instance.update({
    where: { id: instance.id },
    data: { killEnabled: true, status: "disabled" }
  });

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "kill_switch",
      message: "Kill switch enabled"
    }
  });

  if (instance.runnerId) {
    try {
      await stopRunnerScript({ runnerId: instance.runnerId, hostAgentUrl: instance.host.baseUrl });
      await prisma.event.create({
        data: {
          workspaceId: instance.workspaceId,
          instanceId: instance.id,
          type: "runner_stopped",
          message: "Runner stopped"
        }
      });
    } catch (error) {
      logError("instances.kill_stop_failed", { instanceId: instance.id, error: (error as Error).message });
    }
  }

  await prisma.host.update({
    where: { id: instance.hostId },
    data: {
      usedCpu: Math.max(instance.host.usedCpu - instance.cpuLimit, 0),
      usedMemoryMb: Math.max(instance.host.usedMemoryMb - instance.memoryLimitMb, 0)
    }
  });

  logInfo("instances.kill", { instanceId: instance.id });

  return jsonOk({
    instance: {
      id: instance.id,
      status: "disabled",
      killEnabled: true
    }
  });
}
