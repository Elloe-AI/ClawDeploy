import { NextRequest } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getEffectiveStatus } from "@/lib/instances";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const instance = await prisma.instance.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId },
    include: { host: true, channels: true }
  });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  const events = await prisma.event.findMany({
    where: { instanceId: instance.id },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const heartbeatTimeoutMs = Number(process.env.RUNNER_HEARTBEAT_TIMEOUT_MS ?? "90000");

  return jsonOk({
    instance: {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      effectiveStatus: getEffectiveStatus(instance, heartbeatTimeoutMs),
      killEnabled: instance.killEnabled,
      lastHeartbeatAt: instance.lastHeartbeatAt,
      cpuLimit: instance.cpuLimit,
      memoryLimitMb: instance.memoryLimitMb,
      runnerId: instance.runnerId,
      runnerPort: instance.runnerPort,
      host: {
        id: instance.host.id,
        name: instance.host.name,
        baseUrl: instance.host.baseUrl,
        region: instance.host.region
      },
      channels: instance.channels.map((channel) => ({
        id: channel.id,
        provider: channel.provider,
        externalId: channel.externalId
      })),
      createdAt: instance.createdAt
    },
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      meta: event.meta,
      createdAt: event.createdAt
    }))
  });
}
