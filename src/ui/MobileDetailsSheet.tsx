"use client";

import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";

export type MobileDetailsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Element that opened the sheet — focus returns here on close. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Optional inert target while open (e.g. main.dashboard-root). */
  inertTargetRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return [...nodes].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

/**
 * Accessible Mobile/Tablet conversation details bottom sheet.
 * Portal + focus trap + background inert + aria-labelledby.
 */
export function MobileDetailsSheet(props: MobileDetailsSheetProps): ReactNode {
  const { open, onClose, returnFocusRef, inertTargetRef, children } = props;
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      (returnFocusRef?.current as HTMLElement | null) ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const t = window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const target = inertTargetRef?.current ?? document.querySelector("main.dashboard-root");
    if (!target) return;
    const el = target as HTMLElement;
    const hadInert = el.hasAttribute("inert");
    el.setAttribute("inert", "");
    return () => {
      if (!hadInert) el.removeAttribute("inert");
    };
  }, [open, inertTargetRef]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panelRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    const restore = previouslyFocusedRef.current;
    if (restore && document.contains(restore)) {
      window.setTimeout(() => restore.focus(), 0);
    }
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function onBackdropClick() {
    onClose();
  }

  function onPanelClick(e: MouseEvent) {
    e.stopPropagation();
  }

  return createPortal(
    <div className="mobile-details-sheet-root" data-testid="mobile-details-sheet-root">
      <button
        type="button"
        className="mobile-details-sheet-scrim"
        aria-label="Close details"
        data-testid="mobile-details-sheet-scrim"
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        className="mobile-details-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="mobile-details-sheet-panel"
        onClick={onPanelClick}
      >
        <div className="mobile-details-sheet-head">
          <div className="mobile-details-sheet-drag" aria-hidden="true" />
          <h2 id={titleId} className="mobile-details-sheet-title" data-testid="mobile-details-sheet-title">
            Details
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="mobile-details-sheet-close inbox-filter-btn"
            aria-label="Close"
            data-testid="mobile-details-sheet-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p id={descId} className="visually-hidden">
          Conversation overview and actions. Press Escape to close.
        </p>
        <div className="mobile-details-sheet-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
