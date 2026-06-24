export type MetaPageCredentialActivationAuditEvent = {
  eventType: "META_PAGE_CREDENTIAL_ACTIVATION";
  tenantId: string;
  actorSalesAgentId: string | null;
  requestedChannels: string[];
  credentialId: string | null;
  credentialVersion: number | null;
  activationState: string;
  errorCode: string | null;
};

const FORBIDDEN_AUDIT_KEYS = [
  "accessToken",
  "access_token",
  "encrypted",
  "ciphertext",
  "tokenFingerprint",
  "authorization",
  "appSecret",
  "encryptionKey"
] as const;

export function buildMetaPageCredentialActivationAuditEvent(
  input: MetaPageCredentialActivationAuditEvent
): MetaPageCredentialActivationAuditEvent {
  return Object.freeze({ ...input });
}

export function assertMetaPageCredentialActivationAuditSafe(value: unknown): void {
  const json = JSON.stringify(value ?? {});
  for (const key of FORBIDDEN_AUDIT_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Activation audit payload must not include ${key}`);
    }
  }
}
