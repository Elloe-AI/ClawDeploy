import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return jsonError("unauthorized", "Authentication required", 401);
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
  if (!workspace) {
    return jsonError("not_found", "Workspace not found", 404);
  }

  return jsonOk({
    billingStatus: workspace.billingStatus,
    stripeCustomerId: workspace.stripeCustomerId,
    stripeSubscriptionId: workspace.stripeSubscriptionId
  });
}
