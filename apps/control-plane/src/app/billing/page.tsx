import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import BillingPanel from "@/components/BillingPanel";

export default async function BillingPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return <BillingPanel />;
}
