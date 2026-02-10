import { decryptString, encryptString, hashSecret, verifySecret } from "@clawdeploy/crypto-utils";
import { deriveSecret } from "@/lib/config";

export function encryptToken(token: string): string {
  return encryptString(token, deriveSecret("data-encryption", "base64"));
}

export function decryptToken(payload: string): string {
  return decryptString(payload, deriveSecret("data-encryption", "base64"));
}

export function hashRunnerSecret(secret: string): { hash: string; salt: string } {
  return hashSecret(secret);
}

export function verifyRunnerSecret(secret: string, hash: string, salt: string): boolean {
  return verifySecret(secret, hash, salt);
}
