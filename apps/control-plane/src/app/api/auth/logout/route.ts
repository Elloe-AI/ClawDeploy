import { clearSessionCookie } from "@/lib/auth";
import { jsonOk } from "@/lib/http";

export async function POST() {
  clearSessionCookie();
  return jsonOk({ status: "logged_out" });
}
