export const SOURCE_POST_SNIPPET_MAX_LENGTH = 140;

const PROVIDER_ID_SNIPPET_PATTERNS = [
  /\b\d{10,}\b/g,
  /\b\d+_\d+\b/g,
  /\bcomment:\S+/gi,
  /\big:comment:\S+/gi,
  /\bpsid[:\s]\S+/gi,
  /\bigsid[:\s]\S+/gi
] as const;

const TOKEN_PATTERNS = [
  /\bEA[A-Za-z0-9]{20,}\b/,
  /\bBearer\s+\S+/i,
  /\baccess_token[=:]\s*\S+/i
];

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function looksLikeToken(value: string): boolean {
  return TOKEN_PATTERNS.some((pattern) => pattern.test(value));
}

function stripProviderIdsFromSnippet(value: string): string {
  let out = value;
  for (const pattern of PROVIDER_ID_SNIPPET_PATTERNS) {
    out = out.replace(pattern, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function looksLikeProviderIdOnly(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+_\d+$/.test(trimmed) || /^\d{10,}$/.test(trimmed) || /^comment:\S+$/i.test(trimmed);
}

/** Trim, drop JSON/URLs/tokens/IDs, and cap length for source post display. */
export function sanitizeSourcePostSnippet(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let trimmed = value.trim();
  if (
    !trimmed ||
    looksLikeJson(trimmed) ||
    looksLikeUrl(trimmed) ||
    looksLikeToken(trimmed) ||
    looksLikeProviderIdOnly(trimmed)
  ) {
    return null;
  }
  trimmed = stripProviderIdsFromSnippet(trimmed);
  if (!trimmed) return null;
  if (trimmed.length > SOURCE_POST_SNIPPET_MAX_LENGTH) {
    return `${trimmed.slice(0, SOURCE_POST_SNIPPET_MAX_LENGTH)}…`;
  }
  return trimmed;
}
