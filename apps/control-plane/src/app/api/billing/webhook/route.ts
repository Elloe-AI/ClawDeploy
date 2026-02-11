import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { logInfo, logWarn } from "@/lib/logger";

function mapStatus(status: string): "trialing" | "active" | "past_due" | "canceled" | "incomplete" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "incomplete";
  }
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) {
      logWarn("stripe.webhook.missing_signature", {
        hasSignature: Boolean(signature),
        hasSecret: Boolean(webhookSecret)
      });
      return jsonError("invalid_signature", "Invalid Stripe webhook signature", 400);
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      logWarn("stripe.webhook.invalid_signature", { error: (error as Error).message });
      return jsonError("invalid_signature", "Invalid Stripe webhook signature", 400);
    }

    logInfo("stripe.webhook.verified", { id: event.id, type: event.type });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (workspaceId) {
        await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            billingStatus: "active",
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined
          }
        });
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
      if (customerId) {
        const workspace = await prisma.workspace.findFirst({ where: { stripeCustomerId: customerId } });
        if (workspace) {
          await prisma.workspace.update({
            where: { id: workspace.id },
            data: {
              billingStatus: mapStatus(subscription.status),
              stripeSubscriptionId: subscription.id
            }
          });
        }
      }
    }

    return jsonOk({ status: "received" });
  } catch (error) {
    return jsonError("billing_error", (error as Error).message, 500);
  }
}
