import { createHash } from "node:crypto";
import type { MetaPageBindingChannelType } from "../domain/metaPageCredentials.js";

/** Build a bounded activation request fingerprint without plaintext token material. */
export function buildMetaPageCredentialActivationRequestFingerprint(input: {
  tenantId: string;
  facebookConnectionId: string;
  instagramConnectionId?: string | null;
  requestedChannels: readonly MetaPageBindingChannelType[];
  expectedCredentialVersion: number;
  credentialId?: string | null;
  tokenFingerprint: string;
}): string {
  const payload = [
    input.tenantId.trim(),
    input.facebookConnectionId.trim(),
    input.instagramConnectionId?.trim() ?? "",
    [...input.requestedChannels].sort().join(","),
    String(input.expectedCredentialVersion),
    input.credentialId?.trim() ?? "",
    input.tokenFingerprint.trim()
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 64);
}
