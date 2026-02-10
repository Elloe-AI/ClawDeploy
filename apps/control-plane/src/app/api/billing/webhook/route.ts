import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { getStripe } from "@/lib/stripe";
import { requireEnv } from "@/lib/config";

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
    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonError("bad_request", "Missing Stripe signature", 400);
    }

    const body = await request.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
    } catch (error) {
      return jsonError("bad_request", (error as Error).message, 400);
    }

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
