import {
  fetchFacebookPostMessageFromGraph,
  type FacebookPostMessageFetchResult
} from "./facebookGraphPostMessage.js";
import {
  buildSafeSourcePostMetadata,
  extractPersistableSourcePostMetadata,
  type SourcePostCaptureSource
} from "./sourcePostContextMetadata.js";

export type SourcePostEnrichmentFailureReason =
  | "not_applicable"
  | "already_present"
  | "missing_post_reference"
  | "missing_access_token"
  | "graph_http_error"
  | "graph_empty_message"
  | "graph_fetch_error"
  | "unsafe_or_empty_text";

export type SourcePostIngestDiagnostics = {
  source_post_enrichment_attempted: boolean;
  source_post_enrichment_source: SourcePostCaptureSource | null;
  source_post_snippet_present: boolean;
  source_post_enrichment_failed_reason: SourcePostEnrichmentFailureReason | null;
};

function isTextInboundMessage(messageType: string): boolean {
  return String(messageType).toUpperCase() !== "IMAGE";
}

function isFacebookCommentIngest(input: {
  channel: string;
  sourceThreadType?: string | null;
  facebookPostId?: string | null;
}): boolean {
  if (input.channel !== "FACEBOOK") return false;
  if (input.sourceThreadType === "FACEBOOK_COMMENT") return true;
  return Boolean(input.facebookPostId?.trim());
}

function isInstagramCommentIngest(input: {
  channel: string;
  sourceThreadType?: string | null;
}): boolean {
  return input.channel === "INSTAGRAM" && input.sourceThreadType === "INSTAGRAM_COMMENT";
}

function isCommentCapableSourcePostIngest(input: {
  channel: string;
  sourceThreadType?: string | null;
  facebookPostId?: string | null;
}): boolean {
  return isFacebookCommentIngest(input) || isInstagramCommentIngest(input);
}

function diagnosticsFromMetadata(
  metadata: Record<string, unknown>,
  failureReason: SourcePostEnrichmentFailureReason | null,
  attempted: boolean
): SourcePostIngestDiagnostics {
  const snippetPresent =
    (typeof metadata.source_post_snippet === "string" && metadata.source_post_snippet.trim().length > 0) ||
    (typeof metadata.source_post_thumbnail_url === "string" &&
      metadata.source_post_thumbnail_url.trim().length > 0);
  const sourceRaw = metadata.source_post_source;
  const source =
    sourceRaw === "webhook_payload" || sourceRaw === "ingest_graph" ? sourceRaw : null;
  return {
    source_post_enrichment_attempted: attempted,
    source_post_enrichment_source: snippetPresent ? source : null,
    source_post_snippet_present: snippetPresent,
    source_post_enrichment_failed_reason: snippetPresent ? null : failureReason
  };
}

/**
 * Resolve allowlisted source-post metadata for inbound persistence.
 * Webhook payload metadata is preferred; worker may fail-open fetch post.message when missing.
 */
export async function resolveSourcePostMetadataForInbound(input: {
  channel: string;
  messageType: string;
  sourceThreadType?: string | null;
  payloadMetadataJson?: Record<string, unknown> | null;
  facebookPostId?: string | null;
  capturedAt?: string;
  pageAccessToken?: string | null;
  fetchPostMessage?: (postId: string) => Promise<FacebookPostMessageFetchResult>;
}): Promise<{ metadata: Record<string, unknown>; diagnostics: SourcePostIngestDiagnostics }> {
  const notApplicable = {
    metadata: {},
    diagnostics: {
      source_post_enrichment_attempted: false,
      source_post_enrichment_source: null,
      source_post_snippet_present: false,
      source_post_enrichment_failed_reason: "not_applicable" as const
    }
  };

  if (!isTextInboundMessage(input.messageType) && !isCommentCapableSourcePostIngest(input)) {
    return notApplicable;
  }

  if (isCommentCapableSourcePostIngest(input)) {
    const fromPayload = extractPersistableSourcePostMetadata(input.payloadMetadataJson);

    if (isInstagramCommentIngest(input)) {
      if (fromPayload.source_post_snippet || fromPayload.source_post_thumbnail_url) {
        return {
          metadata: fromPayload,
          diagnostics: diagnosticsFromMetadata(fromPayload, null, true)
        };
      }
      return notApplicable;
    }

    if (isFacebookCommentIngest(input) && fromPayload.source_post_snippet) {
      // Facebook webhook value.photo may be a comment attachment — only preserve payload thumbnails from ingest_graph.
      const snippetOnlyMetadata = buildSafeSourcePostMetadata({
        sourcePostText: fromPayload.source_post_snippet,
        sourcePostThumbnailUrl:
          fromPayload.source_post_source === "ingest_graph"
            ? fromPayload.source_post_thumbnail_url
            : undefined,
        source:
          fromPayload.source_post_source === "webhook_payload" ||
          fromPayload.source_post_source === "ingest_graph"
            ? fromPayload.source_post_source
            : undefined,
        capturedAt:
          typeof fromPayload.source_post_captured_at === "string"
            ? fromPayload.source_post_captured_at
            : input.capturedAt
      });
      return {
        metadata: snippetOnlyMetadata,
        diagnostics: diagnosticsFromMetadata(snippetOnlyMetadata, null, true)
      };
    }
  }

  if (!isFacebookCommentIngest(input)) {
    return notApplicable;
  }

  const postId = input.facebookPostId?.trim() ?? "";
  if (!postId) {
    return {
      metadata: {},
      diagnostics: {
        source_post_enrichment_attempted: true,
        source_post_enrichment_source: null,
        source_post_snippet_present: false,
        source_post_enrichment_failed_reason: "missing_post_reference"
      }
    };
  }

  const fetch =
    input.fetchPostMessage ??
    (async (id: string) => fetchFacebookPostMessageFromGraph({ postId: id, pageAccessToken: input.pageAccessToken }));

  const fetched = await fetch(postId);
  if (!fetched.ok) {
    const reason = fetched.reason as SourcePostEnrichmentFailureReason;
    return {
      metadata: {},
      diagnostics: {
        source_post_enrichment_attempted: true,
        source_post_enrichment_source: null,
        source_post_snippet_present: false,
        source_post_enrichment_failed_reason:
          reason === "missing_access_token" ||
          reason === "graph_http_error" ||
          reason === "graph_empty_message" ||
          reason === "graph_fetch_error"
            ? reason
            : "graph_fetch_error"
      }
    };
  }

  const metadata = buildSafeSourcePostMetadata({
    sourcePostText: fetched.message,
    sourcePostThumbnailUrl: fetched.thumbnailUrl,
    source: "ingest_graph",
    capturedAt: input.capturedAt
  });

  if (!metadata.source_post_snippet && !metadata.source_post_thumbnail_url) {
    return {
      metadata: {},
      diagnostics: {
        source_post_enrichment_attempted: true,
        source_post_enrichment_source: null,
        source_post_snippet_present: false,
        source_post_enrichment_failed_reason: "unsafe_or_empty_text"
      }
    };
  }

  return {
    metadata,
    diagnostics: diagnosticsFromMetadata(metadata, null, true)
  };
}
