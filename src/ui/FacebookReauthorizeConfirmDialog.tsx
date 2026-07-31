"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  canDismissFacebookReauthorizeConfirm,
  FACEBOOK_REAUTHORIZE_CONFIRM_COPY,
  formatFacebookReauthorizeLinkedPageLine
} from "./facebookReauthorizeModel.js";

export type FacebookReauthorizeConfirmPhase = "idle" | "pending" | "error";

export type FacebookReauthorizeConfirmDialogProps = {
  open: boolean;
  phase: FacebookReauthorizeConfirmPhase;
  providerPageName: string | null;
  providerPageId: string | null;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  return [...nodes].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export function FacebookReauthorizeConfirmDialog(
  props: FacebookReauthorizeConfirmDialogProps
): ReactNode {
  const { open, phase, providerPageName, providerPageId, errorMessage, onCancel, onConfirm } = props;
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const pending = phase === "pending";
  const dismissible = canDismissFacebookReauthorizeConfirm(phase);
  const linkedPage = formatFacebookReauthorizeLinkedPageLine({ providerPageName, providerPageId });

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      cancelRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!dismissible) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onCancel();
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
  }, [open, dismissible, onCancel]);

  if (!open || typeof document === "undefined") return null;

  function onBackdropClick() {
    if (!dismissible) return;
    onCancel();
  }

  function onPanelClick(e: MouseEvent) {
    e.stopPropagation();
  }

  return createPortal(
    <div className="logout-confirm-root" data-testid="facebook-reauthorize-confirm-root">
      <button
        type="button"
        className="logout-confirm-scrim"
        aria-label="Close dialog"
        data-testid="facebook-reauthorize-confirm-backdrop"
        disabled={!dismissible}
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        className="logout-confirm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="facebook-reauthorize-confirm-dialog"
        onClick={onPanelClick}
      >
        <h2 id={titleId} className="logout-confirm-title" data-testid="facebook-reauthorize-confirm-title">
          {FACEBOOK_REAUTHORIZE_CONFIRM_COPY.title}
        </h2>
        <div id={descId} className="logout-confirm-message" data-testid="facebook-reauthorize-confirm-message">
          <p>{FACEBOOK_REAUTHORIZE_CONFIRM_COPY.intro}</p>
          <p>
            <strong>Linked Page:</strong> {linkedPage}
          </p>
          <p>{FACEBOOK_REAUTHORIZE_CONFIRM_COPY.mustSelectSamePage}</p>
          <p>{FACEBOOK_REAUTHORIZE_CONFIRM_COPY.credentialUntilSuccess}</p>
        </div>
        {phase === "error" && errorMessage ? (
          <p className="logout-confirm-error" role="alert" data-testid="facebook-reauthorize-confirm-error">
            {errorMessage}
          </p>
        ) : null}
        {pending ? (
          <p className="logout-confirm-pending" role="status" data-testid="facebook-reauthorize-confirm-pending">
            {FACEBOOK_REAUTHORIZE_CONFIRM_COPY.pending}
          </p>
        ) : null}
        <div className="logout-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="logout-confirm-cancel"
            data-testid="facebook-reauthorize-confirm-cancel"
            disabled={pending}
            onClick={() => {
              if (!dismissible) return;
              onCancel();
            }}
          >
            {FACEBOOK_REAUTHORIZE_CONFIRM_COPY.cancel}
          </button>
          <button
            type="button"
            className="logout-confirm-submit"
            data-testid="facebook-reauthorize-confirm-submit"
            disabled={pending}
            onClick={() => {
              if (pending) return;
              onConfirm();
            }}
          >
            {pending ? FACEBOOK_REAUTHORIZE_CONFIRM_COPY.pending : FACEBOOK_REAUTHORIZE_CONFIRM_COPY.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
