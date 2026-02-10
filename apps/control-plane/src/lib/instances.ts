import type { Instance } from "@prisma/client";

export function isHeartbeatStale(lastHeartbeatAt: Date | null, timeoutMs: number): boolean {
  if (!lastHeartbeatAt) return true;
  return Date.now() - lastHeartbeatAt.getTime() > timeoutMs;
}

export function getEffectiveStatus(instance: Instance, timeoutMs: number): string {
  if (instance.killEnabled) return "disabled";
  if (instance.status === "error" || instance.status === "stopped") return instance.status;
  if (instance.status === "provisioning") return instance.status;
  if (isHeartbeatStale(instance.lastHeartbeatAt, timeoutMs)) return "stopped";
  return instance.status;
}
