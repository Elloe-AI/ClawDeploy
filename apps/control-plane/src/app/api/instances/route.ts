import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getEffectiveStatus } from "@/lib/instances";
import { hashRunnerSecret } from "@/lib/crypto";
import { provisionRunnerScript } from "@/lib/provisioning";
import { isBillingActive } from "@/lib/billing";
import { logError, logInfo } from "@/lib/logger";

const createSchema = z.object({
  name: z.string().min(2).max(64).optional()
});

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const heartbeatTimeoutMs = Number(process.env.RUNNER_HEARTBEAT_TIMEOUT_MS ?? "90000");
  const instances = await prisma.instance.findMany({
    where: { workspaceId: session.workspaceId },
    include: {
      host: true,
      channels: true
    },
    orderBy: { createdAt: "desc" }
  });

  return jsonOk({
    instances: instances.map((instance) => ({
      id: instance.id,
      name: instance.name,
      status: instance.status,
      effectiveStatus: getEffectiveStatus(instance, heartbeatTimeoutMs),
      killEnabled: instance.killEnabled,
      lastHeartbeatAt: instance.lastHeartbeatAt,
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
    }))
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid instance payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
  if (!workspace) {
    return jsonError("not_found", "Workspace not found", 404);
  }
  if (!isBillingActive(workspace.billingStatus)) {
    return jsonError("billing_required", "Active subscription required", 403, {
      billingStatus: workspace.billingStatus
    });
  }

  const host = await prisma.host.findFirst({
    where: { status: "active" },
    orderBy: [{ usedCpu: "asc" }, { usedMemoryMb: "asc" }]
  });
  if (!host) {
    return jsonError("no_capacity", "No active hosts available", 503);
  }

  const cpuLimit = Number(process.env.DEFAULT_RUNNER_CPU_LIMIT ?? "1");
  const memoryLimitMb = Number(process.env.DEFAULT_RUNNER_MEMORY_LIMIT_MB ?? "1024");
  if (host.usedCpu + cpuLimit > host.capacityCpu || host.usedMemoryMb + memoryLimitMb > host.capacityMemoryMb) {
    return jsonError("no_capacity", "Host capacity exhausted", 503);
  }

  const runnerSecret = crypto.randomBytes(32).toString("base64");
  const { hash, salt } = hashRunnerSecret(runnerSecret);
  const instanceName = parsed.data.name ?? `instance-${crypto.randomUUID().slice(0, 8)}`;

  const instance = await prisma.instance.create({
    data: {
      workspaceId: workspace.id,
      hostId: host.id,
      name: instanceName,
      status: "provisioning",
      runnerSecretHash: hash,
      runnerSecretSalt: salt,
      cpuLimit,
      memoryLimitMb
    }
  });

  await prisma.event.create({
    data: {
      workspaceId: workspace.id,
      instanceId: instance.id,
      type: "instance_created",
      message: "Instance created"
    }
  });

  try {
    const provisioned = await provisionRunnerScript({
      instanceId: instance.id,
      runnerImage: process.env.RUNNER_IMAGE ?? "clawdeploy-runner:dev",
      cpuLimit,
      memoryLimitMb,
      runnerSecret,
      hostAgentUrl: host.baseUrl
    });

    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        runnerId: provisioned.runnerId,
        runnerPort: provisioned.runnerPort
      }
    });

    await prisma.host.update({
      where: { id: host.id },
      data: {
        usedCpu: host.usedCpu + cpuLimit,
        usedMemoryMb: host.usedMemoryMb + memoryLimitMb
      }
    });

    await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        instanceId: instance.id,
        type: "instance_provisioned",
        message: "Runner provisioning requested"
      }
    });

    logInfo("instances.create", { instanceId: instance.id, hostId: host.id });

    return jsonOk({
      instance: {
        id: instance.id,
        name: instance.name,
        status: instance.status,
        hostId: instance.hostId,
        createdAt: instance.createdAt
      }
    }, 201);
  } catch (error) {
    logError("instances.provision_failed", { instanceId: instance.id, error: (error as Error).message });

    await prisma.instance.update({
      where: { id: instance.id },
      data: { status: "error" }
    });

    await prisma.event.create({
      data: {
        workspaceId: workspace.id,
        instanceId: instance.id,
        type: "instance_error",
        message: "Provisioning failed"
      }
    });

    return jsonError("provision_failed", "Provisioning failed", 500);
  }
}
