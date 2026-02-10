import Stripe from "stripe";
import { requireEnv } from "@/lib/config";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2024-06-20"
    });
  }
  return stripe;
}
