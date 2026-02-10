import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import InstanceDetail from "@/components/InstanceDetail";

export default async function InstancePage({ params }: { params: { id: string } }) {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  return <InstanceDetail instanceId={params.id} />;
}
