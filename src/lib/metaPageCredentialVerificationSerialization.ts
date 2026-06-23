import type {
  VerifiedMetaPageCredentialProof,
  VerifiedMetaPageCredentialProofMetadata
} from "../domain/metaPageCredentialVerification.js";

const FORBIDDEN_SERIALIZATION_KEYS = new Set([
  "accessToken",
  "access_token",
  "authorization",
  "authorizationHeader",
  "appSecret",
  "app_secret",
  "appAccessToken",
  "encryptedAccessToken",
  "ciphertext",
  "encryptionKey",
  "rawProviderResponse",
  "debugTokenResponse",
  "plaintextSecret"
]);

export function assertMetaPageVerificationMetadataSafeForSerialization(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) assertMetaPageVerificationMetadataSafeForSerialization(item);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_SERIALIZATION_KEYS.has(key)) {
      throw new Error(`Meta Page verification metadata contains forbidden key: ${key}`);
    }
    if (nested && typeof nested === "object") {
      assertMetaPageVerificationMetadataSafeForSerialization(nested);
    }
  }
}

export function toVerifiedMetaPageCredentialProofPublicDto(
  proof: VerifiedMetaPageCredentialProof
): VerifiedMetaPageCredentialProofMetadata {
  const dto = { ...proof.metadata };
  assertMetaPageVerificationMetadataSafeForSerialization(dto);
  return dto;
}

export function assertProofJsonExcludesSecrets(proof: VerifiedMetaPageCredentialProof): void {
  const json = JSON.stringify(proof.metadata);
  assertMetaPageVerificationMetadataSafeForSerialization(JSON.parse(json));
  for (const pattern of [/access_token/i, /authorization/i, /app_secret/i, /\bEA[A-Za-z0-9]{20,}/]) {
    if (pattern.test(json)) {
      throw new Error("Verified proof serialization contains secret-like content");
    }
  }
}
