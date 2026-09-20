import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(value: string) {
  if (!/^[a-fA-F0-9]{64}$/.test(value))
    throw new Error("Session encryption requires a 32-byte hexadecimal key.");
  return Buffer.from(value, "hex");
}
export function seal(value: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}
export function unseal(value: string, key: string) {
  const data = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(key), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8");
}
export function sessionDigest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
