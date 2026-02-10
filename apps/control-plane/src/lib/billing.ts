import type { BillingStatus } from "@clawdeploy/shared-types";

export function isBillingActive(status: BillingStatus): boolean {
  return status === "active" || status === "trialing";
}
