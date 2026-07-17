"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_OPTIONS,
  applyAppearanceToDocument,
  readAppearancePreference,
  setAppearancePreference,
  type AppearancePreference
} from "./appearancePreference.js";

function AppearanceIcon() {
  return (
    <svg
      className="dashboard-nav-icon"
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

type MenuCoords = { top: number; left: number };

export function AppearanceMenu() {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<AppearancePreference>("system");
  const [coords, setCoords] = useState<MenuCoords | null>(null);

  useEffect(() => {
    const current = readAppearancePreference();
    setPreference(current);
    applyAppearanceToDocument(current);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<AppearancePreference>).detail;
      setPreference(detail === "light" || detail === "dark" || detail === "system" ? detail : readAppearancePreference());
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, onChange);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 160;
    const left = Math.min(rect.right + 8, window.innerWidth - menuWidth - 8);
    const top = Math.max(8, rect.bottom - 120);
    setCoords({ top, left: Math.max(8, left) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onReposition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 160;
      const left = Math.min(rect.right + 8, window.innerWidth - menuWidth - 8);
      const top = Math.max(8, rect.bottom - 120);
      setCoords({ top, left: Math.max(8, left) });
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const selectedLabel = APPEARANCE_OPTIONS.find((o) => o.value === preference)?.label ?? "System";

  const choose = (value: AppearancePreference) => {
    const next = setAppearancePreference(value);
    setPreference(next);
    setOpen(false);
  };

  return (
    <div className="appearance-menu" ref={rootRef} data-testid="appearance-menu">
      <button
        ref={triggerRef}
        type="button"
        className="app-rail-footer-btn appearance-menu-trigger"
        data-testid="appearance-menu-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        title={`Appearance: ${selectedLabel}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="app-rail-nav-icon" aria-hidden="true">
          <AppearanceIcon />
        </span>
        <span className="app-rail-nav-label">Appearance</span>
      </button>
      {open && coords ? (
        <ul
          id={listId}
          className="appearance-menu-list"
          role="listbox"
          aria-label="Appearance"
          data-testid="appearance-menu-list"
          style={{ top: coords.top, left: coords.left }}
        >
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = option.value === preference;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  className={
                    selected ? "appearance-menu-option appearance-menu-option-selected" : "appearance-menu-option"
                  }
                  aria-selected={selected}
                  data-testid={`appearance-option-${option.value}`}
                  onClick={() => choose(option.value)}
                >
                  <span>{option.label}</span>
                  {selected ? (
                    <span className="appearance-menu-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
