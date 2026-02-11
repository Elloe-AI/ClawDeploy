import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { decryptToken } from "@/lib/crypto";
import { sendTelegramMessage } from "@/lib/telegram";
import { executeRunner } from "@/lib/host-agent";
import { getMessageLimiter } from "@/lib/rate-limit";
import { isBillingActive } from "@/lib/billing";
import { isHeartbeatStale } from "@/lib/instances";
import {
  buildAgentInput,
  extractSignalOutput,
  formatSignalTelegramMessage,
  parseMarketStateFromText,
  type MarketState
} from "@/lib/signal-contract";
import type { TelegramWebhookUpdate } from "@clawdeploy/shared-types";

const HEARTBEAT_TIMEOUT_MS = 90_000;
const MAX_EXECUTION_TIME_MS = 300_000;
const MAX_MESSAGES_PER_MIN = 60;

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as TelegramWebhookUpdate | null;
  if (!payload || !payload.message || !payload.message.chat) {
    return jsonOk({ status: "ignored" });
  }

  const chatId = String(payload.message.chat.id);
  const text = payload.message.text ?? "";
  if (!text) {
    return jsonOk({ status: "ignored" });
  }
  if (text.length > 4000) {
    return jsonError("invalid_request", "Message too long", 400);
  }

  const channel = await prisma.channel.findFirst({
    where: { provider: "telegram", externalId: chatId },
    include: { instance: { include: { host: true, workspace: true } } }
  });

  if (!channel) {
    return jsonError("not_found", "Channel not registered", 404);
  }

  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secretHeader || secretHeader !== channel.webhookSecret) {
    return jsonError("unauthorized", "Invalid Telegram webhook secret", 401);
  }

  const instance = channel.instance;
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

  const heartbeatTimeoutMs = HEARTBEAT_TIMEOUT_MS;
  if (isHeartbeatStale(instance.lastHeartbeatAt, heartbeatTimeoutMs)) {
    return jsonError("runner_unhealthy", "Runner heartbeat is stale", 503);
  }

  const limiter = getMessageLimiter();
  const limitResult = await limiter.check(`telegram:${instance.id}`);
  if (!limitResult.allowed) {
    return jsonError("rate_limited", "Message rate limit exceeded", 429, {
      reset: limitResult.reset
    });
  }

  if (!instance.runnerId) {
    return jsonError("runner_missing", "Runner is not registered", 503);
  }

  let marketState: MarketState;
  try {
    marketState = parseMarketStateFromText(text);
  } catch (error) {
    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "telegram_invalid_input",
        message: "Telegram payload could not be parsed as market data",
        meta: { chatId, error: (error as Error).message }
      }
    });

    try {
      const botToken = decryptToken(channel.botTokenEncrypted);
      await sendTelegramMessage({
        botToken,
        chatId,
        text:
          "Unable to parse market payload. Send a Polymarket market JSON payload.\n\nMode: Signal-only (no auto-trading)"
      });
    } catch {
      // Ignore follow-up messaging failures
    }

    return jsonOk({ status: "invalid_market" });
  }

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "telegram_inbound",
      message: "Telegram message received",
      meta: { chatId }
    }
  });

  try {
    const timeoutMs = MAX_EXECUTION_TIME_MS;
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

    const botToken = decryptToken(channel.botTokenEncrypted);
    const signal = extractSignalOutput(result.messages, result.output);
    if (!signal) {
      await prisma.event.create({
        data: {
          workspaceId: instance.workspaceId,
          instanceId: instance.id,
          type: "telegram_invalid_output",
          message: "Runner returned invalid signal output",
          meta: { chatId, requestId: result.requestId, executionId }
        }
      });

      await sendTelegramMessage({
        botToken,
        chatId,
        text:
          "No valid signal returned. Signal-only mode requires BUY_YES, BUY_NO, or HOLD.\n\nMode: Signal-only (no auto-trading)"
      });

      return jsonOk({ status: "invalid_signal" });
    }

    await sendTelegramMessage({
      botToken,
      chatId,
      text: formatSignalTelegramMessage(signal, marketState)
    });

    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "telegram_outbound",
        message: "Telegram response sent",
        meta: { chatId, requestId: result.requestId, executionId, signal: signal.signal }
      }
    });

    return jsonOk({ status: "delivered" });
  } catch (error) {
    const message = (error as Error).message;
    await prisma.event.create({
      data: {
        workspaceId: instance.workspaceId,
        instanceId: instance.id,
        type: "telegram_error",
        message: "Telegram execution failed",
        meta: { chatId, error: message }
      }
    });

    try {
      const botToken = decryptToken(channel.botTokenEncrypted);
      await sendTelegramMessage({
        botToken,
        chatId,
        text: `Execution failed. Signal-only mode; no auto-trading.\nReason: ${message}`
      });
    } catch {
      // Ignore follow-up messaging failures
    }

    return jsonError("execution_failed", message, 500);
  }
}
