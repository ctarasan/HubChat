/** Pure helpers for Appearance menu positioning and keyboard navigation. */

import type { AppearancePreference } from "./appearancePreference.js";
import { APPEARANCE_OPTIONS } from "./appearancePreference.js";

export const APPEARANCE_MENU_WIDTH = 160;
export const APPEARANCE_MENU_VIEWPORT_MARGIN = 8;
export const APPEARANCE_MENU_GAP = 8;

export type RectLike = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type AppearanceMenuCoords = { top: number; left: number };

/** Prefer below the trigger; flip above when needed; clamp inside the viewport. */
export function computeAppearanceMenuCoords(input: {
  trigger: RectLike;
  menuHeight: number;
  menuWidth?: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  gap?: number;
}): AppearanceMenuCoords {
  const menuWidth = input.menuWidth ?? APPEARANCE_MENU_WIDTH;
  const margin = input.margin ?? APPEARANCE_MENU_VIEWPORT_MARGIN;
  const gap = input.gap ?? APPEARANCE_MENU_GAP;
  const menuHeight = Math.max(0, input.menuHeight);

  const spaceBelow = input.viewportHeight - input.trigger.bottom - margin;
  const spaceAbove = input.trigger.top - margin;
  const openBelow = spaceBelow >= menuHeight + gap || spaceBelow >= spaceAbove;

  let top = openBelow ? input.trigger.bottom + gap : input.trigger.top - gap - menuHeight;
  const maxTop = Math.max(margin, input.viewportHeight - menuHeight - margin);
  top = Math.min(Math.max(margin, top), maxTop);

  let left = input.trigger.right + gap;
  const maxLeft = Math.max(margin, input.viewportWidth - menuWidth - margin);
  left = Math.min(Math.max(margin, left), maxLeft);

  return { top, left };
}

export function appearanceOptionIndex(preference: AppearancePreference): number {
  const idx = APPEARANCE_OPTIONS.findIndex((o) => o.value === preference);
  return idx >= 0 ? idx : 0;
}

/** Focus index when opening: currently selected option. */
export function initialAppearanceMenuFocusIndex(preference: AppearancePreference): number {
  return appearanceOptionIndex(preference);
}

/**
 * Keyboard navigation for radio-menu options.
 * Returns next focus index, or null when the key is not a focus-move key.
 */
export function nextAppearanceMenuFocusIndex(
  currentIndex: number,
  key: string,
  optionCount: number = APPEARANCE_OPTIONS.length
): number | null {
  if (optionCount <= 0) return null;
  const clamped = Math.min(Math.max(0, currentIndex), optionCount - 1);
  switch (key) {
    case "ArrowDown":
      return (clamped + 1) % optionCount;
    case "ArrowUp":
      return (clamped - 1 + optionCount) % optionCount;
    case "Home":
      return 0;
    case "End":
      return optionCount - 1;
    default:
      return null;
  }
}

export function isAppearanceMenuSelectKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

export function isAppearanceMenuOpenKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp";
}
