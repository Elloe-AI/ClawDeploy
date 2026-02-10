import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { encryptToken } from "@/lib/crypto";
import { setTelegramWebhook } from "@/lib/telegram";
import { logInfo } from "@/lib/logger";

const schema = z.object({
  botToken: z.string().min(20),
  chatId: z.string().min(1)
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid Telegram payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const instance = await prisma.instance.findFirst({
    where: { id: params.id, workspaceId: session.workspaceId }
  });
  if (!instance) {
    return jsonError("not_found", "Instance not found", 404);
  }

  const webhookSecret = crypto.randomBytes(24).toString("base64");
  const botTokenEncrypted = encryptToken(parsed.data.botToken);

  await setTelegramWebhook({
    botToken: parsed.data.botToken,
    secretToken: webhookSecret
  });

  const existing = await prisma.channel.findFirst({
    where: { instanceId: instance.id, provider: "telegram" }
  });

  if (existing) {
    await prisma.channel.update({
      where: { id: existing.id },
      data: {
        externalId: parsed.data.chatId,
        botTokenEncrypted,
        webhookSecret
      }
    });
  } else {
    await prisma.channel.create({
      data: {
        instanceId: instance.id,
        provider: "telegram",
        externalId: parsed.data.chatId,
        botTokenEncrypted,
        webhookSecret
      }
    });
  }

  await prisma.event.create({
    data: {
      workspaceId: instance.workspaceId,
      instanceId: instance.id,
      type: "telegram_connected",
      message: "Telegram channel connected",
      meta: { chatId: parsed.data.chatId }
    }
  });

  logInfo("telegram.connect", { instanceId: instance.id });

  return jsonOk({
    status: "connected",
    chatId: parsed.data.chatId
  });
}
