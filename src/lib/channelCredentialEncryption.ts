import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;

export class ChannelCredentialEncryptionError extends Error {
  override readonly name = "ChannelCredentialEncryptionError";
}

export type ChannelCredentialEncryptionKeySource = "constructor" | "env" | "process_env";

export type ChannelCredentialEncryptionKeyResolution =
  | { status: "configured"; keyMaterial: string; source: ChannelCredentialEncryptionKeySource }
  | { status: "missing" }
  | { status: "invalid_format" };

function readTrimmedCredentialEncryptionKeyRaw(env: Record<string, unknown>): string | null {
  const raw = env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Detect unresolved Railway/compose template references that look configured but are not usable. */
export function isInvalidCredentialEncryptionKeyFormat(raw: string): boolean {
  return /\$\{\{/.test(raw);
}

/**
 * Canonical encryption-key resolution for worker startup, repository decrypt, and runtime resolver.
 * Precedence: constructor injection → env.HUBCHAT_CREDENTIAL_ENCRYPTION_KEY → process.env fallback
 * when the supplied env object is a parsed subset (for example zod WorkerEnv before passthrough).
 */
export function resolveChannelCredentialEncryptionKey(input?: {
  env?: Record<string, unknown>;
  constructorKey?: string | null;
}): ChannelCredentialEncryptionKeyResolution {
  const env = input?.env ?? process.env;

  const constructorRaw = input?.constructorKey?.trim();
  if (constructorRaw) {
    if (isInvalidCredentialEncryptionKeyFormat(constructorRaw)) {
      return { status: "invalid_format" };
    }
    return { status: "configured", keyMaterial: constructorRaw, source: "constructor" };
  }

  const fromEnv = readTrimmedCredentialEncryptionKeyRaw(env);
  if (fromEnv) {
    if (isInvalidCredentialEncryptionKeyFormat(fromEnv)) {
      return { status: "invalid_format" };
    }
    return { status: "configured", keyMaterial: fromEnv, source: "env" };
  }

  if (env !== process.env) {
    const fromProcess = readTrimmedCredentialEncryptionKeyRaw(process.env);
    if (fromProcess) {
      if (isInvalidCredentialEncryptionKeyFormat(fromProcess)) {
        return { status: "invalid_format" };
      }
      return { status: "configured", keyMaterial: fromProcess, source: "process_env" };
    }
  }

  return { status: "missing" };
}

export function isChannelCredentialEncryptionKeyConfigured(
  env: Record<string, unknown> = process.env,
  constructorKey?: string | null
): boolean {
  return resolveChannelCredentialEncryptionKey({ env, constructorKey }).status === "configured";
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
  env: Record<string, unknown> = process.env,
  constructorKey?: string | null
): string | null {
  const resolved = resolveChannelCredentialEncryptionKey({ env, constructorKey });
  return resolved.status === "configured" ? resolved.keyMaterial : null;
}
