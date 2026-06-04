import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;

export class ChannelCredentialEncryptionError extends Error {
  override readonly name = "ChannelCredentialEncryptionError";
}

/** Derive a 32-byte AES key from platform env material (SmartKorp system secret). */
export function deriveChannelCredentialEncryptionKey(keyMaterial: string): Buffer {
  const trimmed = keyMaterial.trim();
  if (!trimmed) {
    throw new ChannelCredentialEncryptionError("Credential encryption key is not configured");
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to hash
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptChannelCredentialPlaintext(plaintext: string, keyMaterial: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) {
    throw new ChannelCredentialEncryptionError("Credential plaintext cannot be empty");
  }
  const key = deriveChannelCredentialEncryptionKey(keyMaterial);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(
    ":"
  );
}

export function decryptChannelCredentialCiphertext(ciphertext: string, keyMaterial: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new ChannelCredentialEncryptionError("Unsupported credential ciphertext format");
  }
  const [, ivPart, dataPart, tagPart] = parts;
  if (!ivPart || !dataPart || !tagPart) {
    throw new ChannelCredentialEncryptionError("Malformed credential ciphertext");
  }
  const key = deriveChannelCredentialEncryptionKey(keyMaterial);
  const iv = Buffer.from(ivPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  if (!plaintext.trim()) {
    throw new ChannelCredentialEncryptionError("Decrypted credential is empty");
  }
  return plaintext;
}

export function readChannelCredentialEncryptionKeyFromEnv(
  env: Record<string, string | undefined> = process.env
): string | null {
  const raw = env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY?.trim();
  return raw && raw.length > 0 ? raw : null;
}
