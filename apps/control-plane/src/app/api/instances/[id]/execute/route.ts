import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { executeRunner } from "@/lib/host-agent";
import { isHeartbeatStale } from "@/lib/instances";
import { isBillingActive } from "@/lib/billing";
import { getMessageLimiter } from "@/lib/rate-limit";
import {
  buildAgentInput,
  extractSignalOutput,
  formatSignalSummary,
  parseMarketStateFromText,
  type MarketState
} from "@/lib/signal-contract";

const schema = z.object({
  input: z.string().min(1).max(4000)
});

const HEARTBEAT_TIMEOUT_MS = 90_000;
const MAX_EXECUTION_TIME_MS = 300_000;
const MAX_MESSAGES_PER_MIN = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid execute payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const instance = await prisma.instance.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId },
    include: { host: true, workspace: true }
  });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  if (!isBillingActive(instance.workspace.billingStatus)) {
    return jsonError("billing_required", "Active subscription required", 403, {
      billingStatus: instance.workspace.billingStatus
    });
  }

  if (instance.killEnabled) {
    return jsonError("instance_disabled", "Kill switch is enabled", 403);
  }

  if (instance.status !== "running") {
    return jsonError("instance_not_ready", "Instance is not running", 409);
  }

  const limiter = getMessageLimiter();
  const limitResult = await limiter.check(`execute:${instance.id}`);
  if (!limitResult.allowed) {
    return jsonError("rate_limited", "Message rate limit exceeded", 429, {
      reset: limitResult.reset
    });
  }

  const heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS;
  if (isHeartbeatStale(instance.lastHeartbeatAt, heartbeatTimeoutMs)) {
    return jsonError("runner_unhealthy", "Runner heartbeat is stale", 503);
  }

  if (!instance.runnerId) {
    return jsonError("runner_missing", "Runner is not registered", 503);
  }

  const timeoutMs = MAX_EXECUTION_TIME_MS;
  let marketState: MarketState;

  try {
    marketState = parseMarketStateFromText(parsed.data.input);
  } catch (error) {
    return jsonError("invalid_market", (error as Error).message, 400);
  }

  try {
    const executionId = crypto.randomUUID();
    const agentInput = buildAgentInput({
      instanceId: instance.id,
      executionId,
      marketState,
      maxMessagesPerMin: MAX_MESSAGES_PER_MIN
    });

    const result = await executeRunner({
      hostBaseUrl: instance.host.baseUrl,
      runnerId: instance.runnerId,
      input: JSON.stringify(agentInput),
      timeoutMs
    });

    const signal = extractSignalOutput(result.messages, result.output);

    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "execute",
        message: "Runner executed message",
        meta: {
          requestId: result.requestId,
          durationMs: result.durationMs,
          executionId
        }
      }
    });

    if (!signal) {
      await prisma.event.create({
        data: {
          workspaceId: instance.workspaceId,
          instanceId: instance.id,
          type: "execute_invalid_output",
          message: "Runner returned invalid signal output",
          meta: { requestId: result.requestId, executionId }
        }
      });

      return jsonOk({
        requestId: result.requestId,
        output:
          "No valid signal returned. Signal-only mode requires BUY_YES, BUY_NO, or HOLD.",
        exitCode: result.exitCode,
        durationMs: result.durationMs
      });
    }

    return jsonOk({
      requestId: result.requestId,
      output: formatSignalSummary(signal, marketState),
      exitCode: result.exitCode,
      durationMs: result.durationMs
    });
  } catch (error) {
    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "execute_error",
        message: "Runner execution failed",
        meta: { error: (error as Error).message }
      }
    });
    return jsonError("execute_failed", (error as Error).message, 502);
  }
}
