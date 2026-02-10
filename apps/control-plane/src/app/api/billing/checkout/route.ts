import { getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/config";

export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return jsonError("unauthorized", "Authentication required", 401);
    }

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    const workspace = await prisma.workspace.findUnique({ where: { id: session.workspaceId } });
    if (!user || !workspace) {
      return jsonError("not_found", "User or workspace not found", 404);
    }

    const stripe = getStripe();
    const priceId = requireEnv("STRIPE_PRICE_ID");
    const baseUrl = requireEnv("BASE_URL").replace(/\/$/, "");

    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { workspaceId: workspace.id }
      });
      customerId = customer.id;
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { stripeCustomerId: customerId }
      });
    }

    const sessionResult = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing?status=success`,
      cancel_url: `${baseUrl}/billing?status=cancelled`,
      metadata: { workspaceId: workspace.id }
    });

    if (!sessionResult.url) {
      return jsonError("checkout_failed", "Stripe checkout URL missing", 500);
    }

    return jsonOk({ checkoutUrl: sessionResult.url });
  } catch (error) {
    return jsonError("billing_error", (error as Error).message, 500);
  }
}
