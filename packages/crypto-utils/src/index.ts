import crypto from "node:crypto";

export type HashResult = {
  hash: string;
  salt: string;
};

export function hashSecret(secret: string, salt?: string): HashResult {
  const saltValue = salt ?? crypto.randomBytes(16).toString("base64");
  const hashBuffer = crypto.scryptSync(secret, saltValue, 32);
  return {
    hash: hashBuffer.toString("base64"),
    salt: saltValue
  };
}

export function verifySecret(secret: string, hash: string, salt: string): boolean {
  const hashBuffer = crypto.scryptSync(secret, salt, 32);
  const stored = Buffer.from(hash, "base64");
  return crypto.timingSafeEqual(hashBuffer, stored);
}

export function encryptString(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes base64");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["enc", iv.toString("base64"), ciphertext.toString("base64"), tag.toString("base64")].join(":");
}

export function decryptString(payload: string, keyBase64: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "enc") {
    throw new Error("Invalid encrypted payload format");
  }
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must be 32 bytes base64");
  }
  const iv = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function signHmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function verifyHmac(payload: string, secret: string, signature: string): boolean {
  const expected = signHmac(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
