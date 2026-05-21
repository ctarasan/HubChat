const TOKEN_PATTERNS = [
  /\bEA[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+\S+/gi,
  /\baccess_token[=:]\s*\S+/gi,
  /\bchannel[_-]?secret[=:]\s*\S+/gi,
  /\bpage_access_token[=:]\s*\S+/gi,
  /\bapp_secret[=:]\s*\S+/gi,
  /\bverify_token[=:]\s*\S+/gi
];

const MAX_MESSAGE_LENGTH = 280;

/** Redact token-like substrings from provider errors before persistence or API response. */
export function sanitizeProviderErrorMessage(raw: unknown): string {
  let message =
    typeof raw === "string"
      ? raw.trim()
      : raw instanceof Error
        ? raw.message.trim()
        : "Provider verification failed.";

  if (!message) message = "Provider verification failed.";

  for (const pattern of TOKEN_PATTERNS) {
    message = message.replace(pattern, "[redacted]");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_MESSAGE_LENGTH)}…`;
  }

  return message;
}
