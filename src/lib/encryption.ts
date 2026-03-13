import crypto from "crypto";
import { IEM } from "./envmgr";

const algorithm = "aes-256-gcm";
let key: string;

export function encrypt(text: string): string {
  if (!key) key = global.encryptionKey ?? IEM.get("ENCRYPTION_KEY")!;

  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(data: string): string {
  if (!key) key = global.encryptionKey ?? IEM.get("ENCRYPTION_KEY")!;

  const buffer = Buffer.from(data, "base64");

  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
