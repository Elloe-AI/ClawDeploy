import { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/http";
import { logInfo } from "@/lib/logger";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError("invalid_request", "Invalid signup payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return jsonError("email_exists", "Email already registered", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash
    }
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `${email.split("@")[0]} workspace`,
      ownerUserId: user.id
    }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { workspaceId: workspace.id }
  });

  const token = await createSessionToken({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email
  });

  setSessionCookie(token);
  logInfo("auth.signup", { userId: user.id, workspaceId: workspace.id });

  return jsonOk({
    user: { id: user.id, email: user.email },
    workspace: { id: workspace.id, name: workspace.name, billingStatus: workspace.billingStatus }
  }, 201);
}
