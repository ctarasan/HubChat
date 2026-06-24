import type {
  VerifiedMetaPageCredentialProof,
  VerifiedMetaPageCredentialProofMetadata
} from "../../domain/metaPageCredentialVerification.js";

/** Module-private factory gate — not exported to HTTP or repository layers. */
export const VERIFIED_META_PAGE_PROOF_FACTORY = Symbol("VerifiedMetaPageCredentialProof.factory");

export function createVerifiedMetaPageCredentialProof(
  factoryToken: symbol,
  input: {
    metadata: VerifiedMetaPageCredentialProofMetadata;
    accessToken: string;
  }
): VerifiedMetaPageCredentialProof {
  if (factoryToken !== VERIFIED_META_PAGE_PROOF_FACTORY) {
    throw new Error("Verified Meta Page credential proof cannot be constructed externally");
  }

  const accessToken = input.accessToken;

  return {
    metadata: Object.freeze({ ...input.metadata }),
    consumeAccessToken<T>(consumer: (token: string) => T): T {
      return consumer(accessToken);
    }
  };
}
