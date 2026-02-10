import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
  if (!user || !workspace) {
    return jsonError("not_found", "User or workspace not found", 404);
  }

  return jsonOk({
    user: { id: user.id, email: user.email },
    workspace: {
      id: workspace.id,
      name: workspace.name,
      billingStatus: workspace.billingStatus
    }
  });
}
