"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST" })
      .catch(() => null)
      .finally(() => router.push("/login"));
  }, [router]);

  return (
    <div className="card">
      <div className="section-title">Signing out</div>
      <p>Redirecting to login.</p>
    </div>
  );
}
