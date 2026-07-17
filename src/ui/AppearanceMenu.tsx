"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_OPTIONS,
  applyAppearanceToDocument,
  readAppearancePreference,
  setAppearancePreference,
  type AppearancePreference
} from "./appearancePreference.js";
import {
  APPEARANCE_MENU_WIDTH,
  computeAppearanceMenuCoords,
  initialAppearanceMenuFocusIndex,
  isAppearanceMenuOpenKey,
  isAppearanceMenuSelectKey,
  nextAppearanceMenuFocusIndex,
  type AppearanceMenuCoords
} from "./appearanceMenuModel.js";

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

export function AppearanceMenu() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<AppearancePreference>("system");
  const [coords, setCoords] = useState<AppearanceMenuCoords | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  useEffect(() => {
    const current = readAppearancePreference();
    setPreference(current);
    applyAppearanceToDocument(current);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<AppearancePreference>).detail;
      setPreference(
        detail === "light" || detail === "dark" || detail === "system" ? detail : readAppearancePreference()
      );
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, onChange);
  }, []);

  const updateCoords = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!triggerRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const measuredHeight = menuRef.current?.getBoundingClientRect().height ?? 0;
    const next = computeAppearanceMenuCoords({
      trigger,
      menuHeight: measuredHeight > 0 ? measuredHeight : 132,
      menuWidth: APPEARANCE_MENU_WIDTH,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    setCoords(next);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    // Second pass after paint so measured menu height is accurate.
    const raf = window.requestAnimationFrame(() => updateCoords());
    return () => window.cancelAnimationFrame(raf);
  }, [open, updateCoords]);

  useLayoutEffect(() => {
    if (!open) return;
    optionRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onReposition = () => updateCoords();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateCoords]);

  const selectedLabel = APPEARANCE_OPTIONS.find((o) => o.value === preference)?.label ?? "System";

  const closeMenu = (restoreTriggerFocus: boolean) => {
    setOpen(false);
    if (restoreTriggerFocus) {
      // Defer until after unmount of menu options.
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const choose = (value: AppearancePreference, restoreTriggerFocus: boolean) => {
    const next = setAppearancePreference(value);
    setPreference(next);
    closeMenu(restoreTriggerFocus);
  };

  const openMenu = (nextFocusIndex?: number) => {
    const idx = nextFocusIndex ?? initialAppearanceMenuFocusIndex(preference);
    setFocusIndex(idx);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isAppearanceMenuOpenKey(event.key)) return;
    event.preventDefault();
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const next = nextAppearanceMenuFocusIndex(focusIndex, event.key);
        if (next !== null) setFocusIndex(next);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      openMenu(APPEARANCE_OPTIONS.length - 1);
      return;
    }
    openMenu(initialAppearanceMenuFocusIndex(preference));
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    const moved = nextAppearanceMenuFocusIndex(focusIndex, event.key);
    if (moved !== null) {
      event.preventDefault();
      setFocusIndex(moved);
      return;
    }
    if (isAppearanceMenuSelectKey(event.key)) {
      event.preventDefault();
      const option = APPEARANCE_OPTIONS[focusIndex];
      if (option) choose(option.value, true);
    }
  };

  return (
    <div className="appearance-menu" ref={rootRef} data-testid="appearance-menu">
      <button
        ref={triggerRef}
        type="button"
        className="app-rail-footer-btn appearance-menu-trigger"
        data-testid="appearance-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={`Appearance: ${selectedLabel}`}
        onClick={() => {
          if (open) closeMenu(false);
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="app-rail-nav-icon" aria-hidden="true">
          <AppearanceIcon />
        </span>
        <span className="app-rail-nav-label">Appearance</span>
      </button>
      {open ? (
        <ul
          ref={menuRef}
          id={menuId}
          className="appearance-menu-list"
          role="menu"
          aria-label="Appearance"
          data-testid="appearance-menu-list"
          style={coords ? { top: coords.top, left: coords.left } : { top: -9999, left: -9999 }}
          onKeyDown={onMenuKeyDown}
        >
          {APPEARANCE_OPTIONS.map((option, index) => {
            const selected = option.value === preference;
            return (
              <li key={option.value} role="presentation">
                <button
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  className={
                    selected ? "appearance-menu-option appearance-menu-option-selected" : "appearance-menu-option"
                  }
                  aria-checked={selected}
                  tabIndex={focusIndex === index ? 0 : -1}
                  data-testid={`appearance-option-${option.value}`}
                  onClick={() => choose(option.value, true)}
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
