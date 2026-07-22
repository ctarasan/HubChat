"use client";

import type { ReactNode } from "react";
import { AppearanceMenu } from "./AppearanceMenu.js";
import { DashboardNavIcon } from "./dashboardNavIcons.js";
import {
  buildDashboardNavItems,
  type DashboardNavActiveId
} from "./dashboardAppRailModel.js";
import type { DashboardNavRole } from "./dashboardNavAccess.js";
import { SMARTKORP_BRAND_ALT, SMARTKORP_BRAND_ASSETS } from "./brandAssets.js";

export type DashboardAppRailProps = {
  activeId: DashboardNavActiveId;
  role: DashboardNavRole | null | undefined;
  /** Show disabled Channels on Inbox when not available (legacy Inbox rail). */
  showInboxPlaceholders?: boolean;
  footer?: ReactNode;
};

function NavIconSlot({ name }: { name: Parameters<typeof DashboardNavIcon>[0]["name"] }) {
  return (
    <span className="app-rail-nav-icon" aria-hidden="true">
      <DashboardNavIcon name={name} />
    </span>
  );
}

export function DashboardAppRail({ activeId, role, showInboxPlaceholders, footer }: DashboardAppRailProps) {
  const items = buildDashboardNavItems({ role, showInboxPlaceholders });

  return (
    <aside className="dashboard-app-rail" data-testid="dashboard-app-rail" aria-label="Application">
      <div className="app-rail-brand">
        <div className="app-rail-logo">
          <img
            className="app-rail-brand-mark"
            src={SMARTKORP_BRAND_ASSETS.wordmark}
            alt={SMARTKORP_BRAND_ALT}
            width={36}
            height={36}
            decoding="async"
            data-testid="app-rail-brand-mark"
          />
        </div>
        <span className="app-rail-product">HubChat</span>
      </div>
      <nav className="app-rail-nav" aria-label="Workspace">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const className = [
            "app-rail-nav-item",
            isActive ? "app-rail-nav-item-active" : "",
            item.disabled ? "app-rail-nav-item-disabled" : ""
          ]
            .filter(Boolean)
            .join(" ");

          if (item.disabled || !item.href) {
            return (
              <button
                key={item.id}
                type="button"
                className={className}
                disabled
                aria-disabled="true"
                title={item.title}
                data-testid={item.testId}
              >
                <NavIconSlot name={item.icon} />
                <span className="app-rail-nav-label">{item.label}</span>
              </button>
            );
          }

          return (
            <a
              key={item.id}
              href={item.href}
              className={className}
              title={item.title}
              data-testid={item.testId}
              {...(isActive ? { "aria-current": "page" as const } : {})}
            >
              <NavIconSlot name={item.icon} />
              <span className="app-rail-nav-label">{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="app-rail-footer">
        <AppearanceMenu />
        {footer}
      </div>
    </aside>
  );
}

export function DashboardAppRailSignOutButton(props: {
  testId?: string;
  onSignOut: () => void;
}) {
  const { testId = "dashboard-sign-out", onSignOut } = props;
  return (
    <button
      type="button"
      className="app-rail-footer-btn dashboard-sign-out"
      data-testid={testId}
      title="Sign out"
      aria-label="Sign out"
      onClick={onSignOut}
    >
      <span className="app-rail-nav-icon" aria-hidden="true">
        <DashboardNavIcon name="log-out" size={18} />
      </span>
    </button>
  );
}

export function DashboardAppRailReloadButton(props: {
  onReload: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { onReload, disabled, loading } = props;
  return (
    <button
      type="button"
      className="app-rail-footer-btn"
      onClick={onReload}
      disabled={disabled}
      title="Reload conversations"
    >
      <span className="app-rail-nav-icon" aria-hidden="true">
        <DashboardNavIcon name="refresh" />
      </span>
      <span className="app-rail-nav-label">{loading ? "…" : "Reload"}</span>
    </button>
  );
}

/**
 * Setup remains a valid direct route (`/setup`) but is intentionally omitted
 * from the visible primary application rail for the current Production UX.
 * Keep this export so pages can stop rendering it without deleting Setup.
 */
export function DashboardAppRailSetupLink(): null {
  return null;
}
