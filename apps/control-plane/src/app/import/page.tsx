import { redirect } from "next/navigation";

export default function ImportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const source = typeof searchParams.source === "string" ? searchParams.source : "";
  const agent = typeof searchParams.agent === "string" ? searchParams.agent : "";

  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (agent) params.set("agent", agent);

  const query = params.toString();
  redirect(query ? `/instances?${query}` : "/instances");
}
