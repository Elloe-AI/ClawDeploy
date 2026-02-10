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
    return jsonError("invalid_request", "Invalid login payload", 400, {
      issues: parsed.error.flatten().fieldErrors
    });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    return jsonError("invalid_credentials", "Invalid email or password", 401);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return jsonError("invalid_credentials", "Invalid email or password", 401);
  }

  if (!user.workspaceId) {
    return jsonError("workspace_missing", "User workspace is not configured", 500);
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: user.workspaceId } });
  if (!workspace) {
    return jsonError("workspace_missing", "Workspace not found", 500);
  }

  const token = await createSessionToken({
    userId: user.id,
    workspaceId: workspace.id,
    email: user.email
  });
  setSessionCookie(token);

  logInfo("auth.login", { userId: user.id, workspaceId: workspace.id });

  return jsonOk({
    user: { id: user.id, email: user.email },
    workspace: { id: workspace.id, name: workspace.name, billingStatus: workspace.billingStatus }
  });
}
