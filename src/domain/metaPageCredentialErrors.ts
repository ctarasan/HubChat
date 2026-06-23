/** Sanitized Meta Page credential errors — never include tokens, ciphertext, or encryption keys. */

export class MetaPageCredentialFamilyMismatchError extends Error {
  override readonly name = "MetaPageCredentialFamilyMismatchError";
}

export class MetaPageCredentialNotFoundError extends Error {
  override readonly name = "MetaPageCredentialNotFoundError";
}

export class MetaPageCredentialTenantMismatchError extends Error {
  override readonly name = "MetaPageCredentialTenantMismatchError";
}

export class MetaPageCredentialBindingConflictError extends Error {
  override readonly name = "MetaPageCredentialBindingConflictError";
}

export class MetaPageCredentialVersionConflictError extends Error {
  override readonly name = "MetaPageCredentialVersionConflictError";
}

export class MetaPageCredentialEncryptionUnavailableError extends Error {
  override readonly name = "MetaPageCredentialEncryptionUnavailableError";
}

export class MetaPageCredentialDecryptionFailedError extends Error {
  override readonly name = "MetaPageCredentialDecryptionFailedError";
}

export class MetaPageCredentialInactiveError extends Error {
  override readonly name = "MetaPageCredentialInactiveError";
}

export class MetaPageCredentialConnectionNotFoundError extends Error {
  override readonly name = "MetaPageCredentialConnectionNotFoundError";
}

export class MetaPageCredentialTokenShapeError extends Error {
  override readonly name = "MetaPageCredentialTokenShapeError";
}
