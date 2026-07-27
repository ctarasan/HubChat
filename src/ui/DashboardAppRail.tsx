"use client";

import { useRef, useState, type ReactNode } from "react";
import { AppearanceMenu } from "./AppearanceMenu.js";
import { DashboardNavIcon } from "./dashboardNavIcons.js";
import {
  buildDashboardNavItems,
  type DashboardNavActiveId
} from "./dashboardAppRailModel.js";
import type { DashboardNavRole } from "./dashboardNavAccess.js";
import { SMARTKORP_BRAND_ALT, SMARTKORP_BRAND_ASSETS } from "./brandAssets.js";
import { LogoutConfirmDialog } from "./LogoutConfirmDialog.js";
import {
  canSubmitLogoutConfirm,
  createLogoutSubmitGuard,
  LOGOUT_CONFIRM_COPY,
  type LogoutConfirmPhase
} from "./logoutConfirmModel.js";

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
        <img
          className="app-rail-brand-mark"
          src={SMARTKORP_BRAND_ASSETS.sidebarLogo}
          alt={SMARTKORP_BRAND_ALT}
          width={52}
          height={39}
          decoding="async"
          data-testid="app-rail-brand-mark"
        />
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
  /** Existing page logout flow — called only after dialog confirmation. */
  onSignOut: () => void | Promise<void>;
}) {
  const { testId = "dashboard-sign-out", onSignOut } = props;
  const [phase, setPhase] = useState<LogoutConfirmPhase>("closed");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const exitBtnRef = useRef<HTMLButtonElement | null>(null);
  const phaseRef = useRef<LogoutConfirmPhase>("closed");
  const submitGuardRef = useRef(createLogoutSubmitGuard());
  phaseRef.current = phase;

  function openDialog() {
    setErrorMessage(null);
    setPhase("open");
  }

  function closeDialog() {
    if (phaseRef.current === "pending") return;
    setPhase("closed");
    setErrorMessage(null);
    window.setTimeout(() => {
      exitBtnRef.current?.focus();
    }, 0);
  }

  async function confirmLogout() {
    if (!canSubmitLogoutConfirm(phaseRef.current)) return;
    if (!submitGuardRef.current.tryBegin()) return;
    setPhase("pending");
    setErrorMessage(null);
    try {
      await onSignOut();
      // Successful logout typically navigates away; keep pending if still mounted.
    } catch {
      submitGuardRef.current.end();
      setPhase("error");
      setErrorMessage(LOGOUT_CONFIRM_COPY.errorFallback);
    }
  }

  return (
    <>
      <button
        ref={exitBtnRef}
        type="button"
        className="app-rail-footer-btn dashboard-sign-out"
        data-testid={testId}
        title="Sign out"
        aria-label="Sign out"
        aria-haspopup="dialog"
        aria-expanded={phase !== "closed"}
        onClick={openDialog}
      >
        <span className="app-rail-nav-icon" aria-hidden="true">
          <DashboardNavIcon name="log-out" size={18} />
        </span>
      </button>
      <LogoutConfirmDialog
        open={phase !== "closed"}
        phase={phase}
        errorMessage={errorMessage}
        onCancel={closeDialog}
        onConfirm={() => {
          void confirmLogout();
        }}
      />
    </>
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
