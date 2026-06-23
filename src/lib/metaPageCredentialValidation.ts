import type { MetaPageCredentialFamily } from "../domain/metaPageCredentials.js";
import { META_PAGE_CREDENTIAL_FAMILIES } from "../domain/metaPageCredentials.js";
import {
  MetaPageCredentialFamilyMismatchError,
  MetaPageCredentialTokenShapeError
} from "../domain/metaPageCredentialErrors.js";

export function isMetaPageCredentialFamily(value: string): value is MetaPageCredentialFamily {
  return (META_PAGE_CREDENTIAL_FAMILIES as string[]).includes(value);
}

export function assertMetaPageCredentialFamily(
  family: string
): asserts family is MetaPageCredentialFamily {
  if (!isMetaPageCredentialFamily(family)) {
    throw new MetaPageCredentialFamilyMismatchError(
      "Meta Page credential family is not supported for shared Page credentials"
    );
  }
}

/** Reject Instagram Login / IGA token family — shared store accepts Facebook Page tokens only. */
export function assertMetaPageFacebookLoginAccessTokenShape(accessToken: string): void {
  const trimmed = accessToken.trim();
  if (!trimmed) {
    throw new MetaPageCredentialTokenShapeError("Meta Page access token cannot be empty");
  }
  if (trimmed.startsWith("IGA") || /^IG_/i.test(trimmed)) {
    throw new MetaPageCredentialTokenShapeError(
      "Instagram Login token family is not supported for shared Meta Page credentials"
    );
  }
}

export function isMetaPageCredentialResolvableStatus(status: string): boolean {
  return status === "ACTIVE";
}
