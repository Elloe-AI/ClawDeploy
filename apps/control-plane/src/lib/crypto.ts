import { decryptString, encryptString, hashSecret, verifySecret } from "@clawdeploy/crypto-utils";
import { requireEnv } from "@/lib/config";

export function encryptToken(token: string): string {
  return encryptString(token, requireEnv("DATA_ENCRYPTION_KEY"));
}

export function decryptToken(payload: string): string {
  return decryptString(payload, requireEnv("DATA_ENCRYPTION_KEY"));
}

export function hashRunnerSecret(secret: string): { hash: string; salt: string } {
  return hashSecret(secret);
}

export function verifyRunnerSecret(secret: string, hash: string, salt: string): boolean {
  return verifySecret(secret, hash, salt);
}
