"use client";

import { useEffect, useState } from "react";

type BillingStatus = {
  billingStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export default function BillingPanel() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/status", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Failed to load billing status");
        setLoading(false);
        return;
      }
      setStatus(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startCheckout() {
    setCheckoutLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.message ?? "Checkout failed");
        setCheckoutLoading(false);
        return;
      }
      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="section-title">Billing</div>
      {loading ? (
        <p>Loading billing status...</p>
      ) : (
        <div>
          <p>Status: {status?.billingStatus}</p>
          <p>Customer: {status?.stripeCustomerId ?? "-"}</p>
          <p>Subscription: {status?.stripeSubscriptionId ?? "-"}</p>
        </div>
      )}
      <button onClick={startCheckout} disabled={checkoutLoading}>
        {checkoutLoading ? "Redirecting..." : "Subscribe"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
