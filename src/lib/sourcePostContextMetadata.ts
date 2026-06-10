import { sanitizeSourcePostSnippet } from "./sourcePostSnippetSanitize.js";

export type SourcePostCaptureSource = "webhook_payload" | "ingest_graph";

export const PERSISTED_SOURCE_POST_METADATA_KEYS = [
  "source_post_snippet",
  "source_post_captured_at",
  "source_post_source"
] as const;

const ALLOWED_SOURCE_VALUES = new Set<SourcePostCaptureSource>(["webhook_payload", "ingest_graph"]);

function normalizeIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Build allowlisted source-post metadata for message persistence (empty when unsafe). */
export function buildSafeSourcePostMetadata(input: {
  sourcePostText?: unknown;
  source?: SourcePostCaptureSource;
  capturedAt?: string;
}): Record<string, unknown> {
  const snippet = sanitizeSourcePostSnippet(input.sourcePostText);
  if (!snippet) return {};

  const capturedAt = normalizeIso(input.capturedAt) ?? new Date().toISOString();
  const out: Record<string, unknown> = {
    source_post_snippet: snippet,
    source_post_captured_at: capturedAt
  };
  if (input.source && ALLOWED_SOURCE_VALUES.has(input.source)) {
    out.source_post_source = input.source;
  }
  return out;
}

/** Re-sanitize allowlisted keys from an inbound metadata object; never pass through other keys. */
export function extractPersistableSourcePostMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};

  const sourceRaw = metadata.source_post_source;
  const source =
    sourceRaw === "webhook_payload" || sourceRaw === "ingest_graph" ? sourceRaw : undefined;

  return buildSafeSourcePostMetadata({
    sourcePostText: metadata.source_post_snippet,
    source,
    capturedAt:
      typeof metadata.source_post_captured_at === "string" ? metadata.source_post_captured_at : undefined
  });
}
