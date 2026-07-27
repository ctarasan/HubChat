"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AppearanceMenu } from "./AppearanceMenu.js";
import { DashboardAppRailSignOutButton } from "./DashboardAppRail.js";

export type MobileInboxOverflowMenuProps = {
  onSignOut: () => void | Promise<void>;
};

/**
 * Compact Mobile/Tablet overflow menu: Appearance (shared) + Sign out (confirmation).
 * Desktop continues to use App Rail AppearanceMenu only.
 */
export function MobileInboxOverflowMenu(props: MobileInboxOverflowMenuProps): ReactNode {
  const { onSignOut } = props;
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = rootRef.current?.querySelector<HTMLElement>(
      '[data-testid="appearance-menu-trigger"], [data-testid="mobile-overflow-sign-out"]'
    );
    window.setTimeout(() => first?.focus(), 0);
  }, [open]);

  function closeAndRestoreFocus() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="mobile-inbox-overflow" ref={rootRef} data-testid="mobile-inbox-overflow">
      <button
        ref={triggerRef}
        type="button"
        className="mobile-inbox-overflow-trigger inbox-filter-btn"
        data-testid="mobile-inbox-overflow-trigger"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (open) closeAndRestoreFocus();
          else setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>
      {open ? (
        <div
          id={menuId}
          className="mobile-inbox-overflow-panel"
          role="menu"
          aria-label="Application menu"
          data-testid="mobile-inbox-overflow-panel"
        >
          <div className="mobile-inbox-overflow-appearance" role="none">
            <AppearanceMenu variant="compact" />
          </div>
          <div className="mobile-inbox-overflow-signout" role="none">
            <DashboardAppRailSignOutButton testId="mobile-overflow-sign-out" onSignOut={onSignOut} />
            <span className="mobile-inbox-overflow-signout-label" aria-hidden="true">
              Sign out
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
