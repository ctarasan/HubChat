function readBooleanEnv(env: Record<string, string | undefined>, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Default-OFF gate for META-CRED-1D-C activation API. Absent or invalid = disabled. */
export function isMetaPageCredentialActivationApiEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return readBooleanEnv(env, "HUBCHAT_META_PAGE_CREDENTIAL_ACTIVATION_API_ENABLED");
}
