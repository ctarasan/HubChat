/** Mask Instagram professional account IDs for operator-safe display. */

export function maskInstagramProfessionalAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  if (trimmed.length <= 4) return "···";
  return `···${trimmed.slice(-4)}`;
}
