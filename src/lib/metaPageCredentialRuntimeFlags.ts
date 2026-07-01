/** Default-OFF gate for META-CRED runtime outbound resolver. Only exact `true` enables the path. */
export function isMetaPageCredentialEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.HUBCHAT_META_PAGE_CREDENTIAL_ENABLED?.trim() === "true";
}
