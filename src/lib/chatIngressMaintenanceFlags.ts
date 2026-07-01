/** Default-OFF gate for chat ingress maintenance. Only exact trimmed lowercase `true` enables the path. */
export function isChatIngressMaintenanceEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.HUBCHAT_CHAT_INGRESS_MAINTENANCE_ENABLED?.trim() === "true";
}
