import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import InstancesList from "@/components/InstancesList";

export default async function InstancesPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return <InstancesList />;
}
