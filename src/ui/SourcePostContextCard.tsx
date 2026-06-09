"use client";

import {
  sourcePostPrivateReplyStatusClassName,
  sourcePostPrivateReplyStatusLabel,
  type SourcePostContextViewModel
} from "./sourcePostContextModel.js";

export function SourcePostContextCard({ context }: { context: SourcePostContextViewModel }) {
  const showOpenPost = context.openPostAvailable && Boolean(context.openPostHref);

  return (
    <section
      className="source-post-context-card"
      data-testid="source-post-context-card"
      aria-label="Source post context"
    >
      <h3 className="source-post-context-title">SOURCE POST</h3>

      <span
        className={`lead-source-badge lead-source-badge-${context.kind.toLowerCase().replace(/_/g, "-")}`}
        data-testid="source-post-context-badge"
      >
        {context.sourceBadgeLabel}
      </span>

      {context.postDetailsAvailable ? (
        <>
          <div className="source-post-context-preview" data-testid="source-post-context-preview">
            {context.postThumbnailUrl ? (
              <img
                className="source-post-context-thumb"
                src={context.postThumbnailUrl}
                alt=""
                data-testid="source-post-context-thumb"
              />
            ) : context.showThumbnailPlaceholder ? (
              <div
                className="source-post-context-thumb-placeholder"
                data-testid="source-post-context-thumb-placeholder"
                aria-hidden="true"
              />
            ) : null}

            <div className="source-post-context-preview-text">
              {context.postSnippet ? (
                <p className="source-post-context-snippet" data-testid="source-post-context-snippet">
                  {context.postSnippet}
                </p>
              ) : null}
            </div>
          </div>

          {context.leadComment ? (
            <div className="source-post-context-lead-comment" data-testid="source-post-context-lead-comment">
              <span className="source-post-context-lead-comment-label">LEAD COMMENT</span>
              <p className="source-post-context-lead-comment-text">{context.leadComment}</p>
            </div>
          ) : null}

          <span
            className={sourcePostPrivateReplyStatusClassName(context.privateReplySent)}
            data-testid="source-post-context-reply-status"
          >
            {sourcePostPrivateReplyStatusLabel(context.privateReplySent)}
          </span>

          {showOpenPost ? (
            <a
              href={context.openPostHref!}
              className="source-post-context-open-btn inbox-filter-btn"
              data-testid="source-post-context-open-post"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open post
            </a>
          ) : null}
        </>
      ) : context.fallbackMessage ? (
        <p className="hint source-post-context-fallback" data-testid="source-post-context-fallback">
          {context.fallbackMessage}
        </p>
      ) : null}
    </section>
  );
}
