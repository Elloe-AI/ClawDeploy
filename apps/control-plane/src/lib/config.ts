import crypto from "node:crypto";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optionalEnv(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value && value.length > 0) {
    return value;
  }
  return fallback;
}

export function getControlPlaneUrl(): string {
  return requireEnv("CONTROL_PLANE_URL").replace(/\/$/, "");
}

export function deriveSecret(label: string, format: "hex" | "base64" = "hex"): string {
  const seed = requireEnv("STRIPE_SECRET_KEY");
  const hash = crypto.createHash("sha256").update(`${label}:${seed}`).digest();
  return format === "base64" ? hash.toString("base64") : hash.toString("hex");
}

export function deriveSecretBytes(label: string): Uint8Array {
  const seed = requireEnv("STRIPE_SECRET_KEY");
  return crypto.createHash("sha256").update(`${label}:${seed}`).digest();
}
