"use client";

import { useMemo, useState } from "react";
import {
  filterMarketingTimelineByGroups,
  formatMarketingTimelineTime,
  groupMarketingTimelineItemsByDate,
  MARKETING_TIMELINE_GROUP_LABELS,
  MARKETING_TIMELINE_GROUP_MARKERS,
  MARKETING_TIMELINE_GROUPS,
  type MarketingTimelineGroup,
  type MarketingTimelineItemViewModel,
  type MarketingTimelineTone
} from "./marketingTimelineModel.js";

export type MarketingTimelinePanelStatus = "idle" | "loading" | "empty" | "error" | "ready";

export type MarketingTimelinePanelProps = {
  status: MarketingTimelinePanelStatus;
  items?: MarketingTimelineItemViewModel[];
  errorMessage?: string;
  title?: string;
  subtitle?: string;
  /** Local-only group filter chips; does not fetch or mutate data. */
  enableGroupFilters?: boolean;
  className?: string;
  onRefresh?: () => void;
  refreshBusy?: boolean;
  onLoadMore?: () => void;
  loadMoreBusy?: boolean;
  hasMore?: boolean;
};

function toneClass(tone: MarketingTimelineTone | undefined): string {
  switch (tone) {
    case "info":
      return "marketing-timeline-marker-info";
    case "success":
      return "marketing-timeline-marker-success";
    case "warn":
      return "marketing-timeline-marker-warn";
    case "accent":
      return "marketing-timeline-marker-accent";
    default:
      return "marketing-timeline-marker-neutral";
  }
}

export function MarketingTimelinePanel({
  status,
  items = [],
  errorMessage = "",
  title = "Marketing signals",
  subtitle = "Read-only activity timeline for the active lead or conversation.",
  enableGroupFilters = true,
  className = "",
  onRefresh,
  refreshBusy = false,
  onLoadMore,
  loadMoreBusy = false,
  hasMore = false
}: MarketingTimelinePanelProps) {
  const [selectedGroups, setSelectedGroups] = useState<Set<MarketingTimelineGroup>>(() => new Set());

  const filteredItems = useMemo(() => {
    if (status !== "ready") return [];
    return filterMarketingTimelineByGroups(items, selectedGroups);
  }, [items, selectedGroups, status]);

  const dateGroups = useMemo(() => {
    if (status !== "ready") return [];
    return groupMarketingTimelineItemsByDate(filteredItems);
  }, [filteredItems, status]);

  function toggleGroup(group: MarketingTimelineGroup) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const rootClass = ["marketing-timeline-panel", className].filter(Boolean).join(" ");

  return (
    <section
      className={rootClass}
      data-testid="marketing-timeline-panel"
      aria-label={title}
    >
      <header className="marketing-timeline-header">
        <div className="marketing-timeline-header-text">
          <h3 className="marketing-timeline-title">{title}</h3>
          <p className="hint marketing-timeline-subtitle">{subtitle}</p>
        </div>
        {onRefresh ? (
          <div className="marketing-timeline-header-actions">
            <button
              type="button"
              className="marketing-timeline-refresh-btn"
              data-testid="marketing-timeline-refresh"
              onClick={onRefresh}
              disabled={refreshBusy}
              title="Refresh marketing signals"
            >
              {refreshBusy ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        ) : null}
      </header>

      {status === "idle" ? (
        <div className="marketing-timeline-state marketing-timeline-idle" data-testid="marketing-timeline-idle">
          <p className="marketing-timeline-state-title">No timeline loaded</p>
          <p className="hint">Select a conversation or lead to load marketing signals.</p>
        </div>
      ) : null}

      {status === "loading" ? (
        <div
          className="marketing-timeline-state marketing-timeline-loading"
          data-testid="marketing-timeline-loading"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="marketing-timeline-skeleton" aria-hidden="true" />
          <div className="marketing-timeline-skeleton marketing-timeline-skeleton-short" aria-hidden="true" />
          <div className="marketing-timeline-skeleton" aria-hidden="true" />
          <p className="hint marketing-timeline-loading-text">Loading marketing signals…</p>
        </div>
      ) : null}

      {status === "error" ? (
        <div
          className="marketing-timeline-state marketing-timeline-error card error"
          data-testid="marketing-timeline-error"
          role="alert"
        >
          <p className="marketing-timeline-state-title">Could not load marketing signals</p>
          <p className="hint">{errorMessage || "Something went wrong. Try again later."}</p>
        </div>
      ) : null}

      {status === "empty" ? (
        <div className="marketing-timeline-state marketing-timeline-empty" data-testid="marketing-timeline-empty">
          <p className="marketing-timeline-state-title">No marketing signals yet</p>
          <p className="hint">Events will appear here when activity is recorded for this lead or conversation.</p>
        </div>
      ) : null}

      {status === "ready" ? (
        <div className="marketing-timeline-body" data-testid="marketing-timeline-ready">
          {enableGroupFilters ? (
            <div
              className="marketing-timeline-filter-bar"
              data-testid="marketing-timeline-filter-bar"
              role="group"
              aria-label="Filter event groups"
            >
              {MARKETING_TIMELINE_GROUPS.map((group) => {
                const active = selectedGroups.has(group);
                return (
                  <button
                    key={group}
                    type="button"
                    className={`marketing-timeline-filter-chip${active ? " marketing-timeline-filter-chip-active" : ""}`}
                    data-testid={`marketing-timeline-filter-${group}`}
                    aria-pressed={active}
                    onClick={() => toggleGroup(group)}
                  >
                    {MARKETING_TIMELINE_GROUP_LABELS[group]}
                  </button>
                );
              })}
              {selectedGroups.size > 0 ? (
                <button
                  type="button"
                  className="marketing-timeline-filter-chip marketing-timeline-filter-clear"
                  data-testid="marketing-timeline-filter-clear"
                  onClick={() => setSelectedGroups(new Set())}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}

          {dateGroups.length === 0 ? (
            <div className="marketing-timeline-state marketing-timeline-empty" data-testid="marketing-timeline-filter-empty">
              <p className="marketing-timeline-state-title">No events match filters</p>
              <p className="hint">Clear filters to see all groups.</p>
            </div>
          ) : (
            <ol className="marketing-timeline-list" data-testid="marketing-timeline-list">
              {dateGroups.map((group) => (
                <li key={group.dateKey} className="marketing-timeline-date-group" data-testid={`marketing-timeline-date-${group.dateKey}`}>
                  <h4 className="marketing-timeline-date-label">{group.dateLabel}</h4>
                  <ul className="marketing-timeline-rows">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="marketing-timeline-row"
                        data-testid={`marketing-timeline-event-${item.id}`}
                      >
                        <span
                          className={`marketing-timeline-marker ${toneClass(item.tone)}`}
                          aria-hidden="true"
                          title={MARKETING_TIMELINE_GROUP_LABELS[item.group]}
                        >
                          {MARKETING_TIMELINE_GROUP_MARKERS[item.group]}
                        </span>
                        <div className="marketing-timeline-row-main">
                          <div className="marketing-timeline-row-head">
                            <span className="marketing-timeline-row-title">{item.title}</span>
                            <time
                              className="marketing-timeline-row-time"
                              dateTime={item.occurredAt}
                            >
                              {formatMarketingTimelineTime(item.occurredAt)}
                            </time>
                          </div>
                          {item.description ? (
                            <p className="hint marketing-timeline-row-description">{item.description}</p>
                          ) : null}
                          <div className="marketing-timeline-row-meta">
                            <span className="marketing-timeline-meta-pill">{item.actorLabel}</span>
                            <span className="marketing-timeline-meta-pill">{item.channelLabel}</span>
                            {item.metadataSummary ? (
                              <span className="marketing-timeline-meta-summary">{item.metadataSummary}</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
          {hasMore && onLoadMore ? (
            <div className="marketing-timeline-load-more">
              <button
                type="button"
                className="marketing-timeline-load-more-btn"
                data-testid="marketing-timeline-load-more"
                onClick={onLoadMore}
                disabled={loadMoreBusy || refreshBusy}
              >
                {loadMoreBusy ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default MarketingTimelinePanel;
