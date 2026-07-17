import test from "node:test";
import assert from "node:assert/strict";
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearanceToDocument,
  setAppearancePreference,
  type AppearancePreference
} from "./appearancePreference.js";
import {
  APPEARANCE_MENU_WIDTH,
  appearanceOptionIndex,
  computeAppearanceMenuCoords,
  initialAppearanceMenuFocusIndex,
  isAppearanceMenuOpenKey,
  isAppearanceMenuSelectKey,
  nextAppearanceMenuFocusIndex
} from "./appearanceMenuModel.js";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  } as Storage;
}

function mockRoot() {
  const attrs = new Map<string, string>();
  const style = { colorScheme: "" };
  return {
    style,
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    }
  };
}

/** Behavioral stand-in for AppearanceMenu keyboard + selection (no React DOM dependency). */
function createMenuHarness(initial: AppearancePreference = "system") {
  const storage = memoryStorage(
    initial === "system" ? {} : { [APPEARANCE_STORAGE_KEY]: initial }
  );
  const root = mockRoot();
  let open = false;
  let preference: AppearancePreference = initial;
  let focusIndex = initialAppearanceMenuFocusIndex(initial);
  let triggerFocused = false;
  const optionFocused = [false, false, false];

  applyAppearanceToDocument(preference, root as unknown as HTMLElement);

  const focusOption = (index: number) => {
    for (let i = 0; i < optionFocused.length; i++) optionFocused[i] = i === index;
    triggerFocused = false;
    focusIndex = index;
  };

  return {
    get open() {
      return open;
    },
    get preference() {
      return preference;
    },
    get focusIndex() {
      return focusIndex;
    },
    get triggerFocused() {
      return triggerFocused;
    },
    get optionFocused() {
      return [...optionFocused];
    },
    get dataTheme() {
      return root.getAttribute("data-theme");
    },
    get stored() {
      return storage.getItem(APPEARANCE_STORAGE_KEY);
    },
    openMenu() {
      open = true;
      focusIndex = initialAppearanceMenuFocusIndex(preference);
      focusOption(focusIndex);
    },
    closeViaEscape() {
      open = false;
      optionFocused.fill(false);
      triggerFocused = true;
    },
    closeViaOutsideClick() {
      open = false;
      optionFocused.fill(false);
      triggerFocused = false;
    },
    onKey(key: string) {
      if (!open) {
        if (!isAppearanceMenuOpenKey(key)) return;
        open = true;
        if (key === "ArrowUp") focusIndex = 2;
        else focusIndex = initialAppearanceMenuFocusIndex(preference);
        focusOption(focusIndex);
        return;
      }
      if (key === "Escape") {
        this.closeViaEscape();
        return;
      }
      const moved = nextAppearanceMenuFocusIndex(focusIndex, key);
      if (moved !== null) {
        focusOption(moved);
        return;
      }
      if (isAppearanceMenuSelectKey(key)) {
        const value = (["system", "light", "dark"] as const)[focusIndex];
        preference = setAppearancePreference(value, {
          storage,
          root: root as unknown as HTMLElement,
          dispatchEvent: false
        });
        open = false;
        optionFocused.fill(false);
        triggerFocused = true;
      }
    },
    selectByClick(value: AppearancePreference) {
      preference = setAppearancePreference(value, {
        storage,
        root: root as unknown as HTMLElement,
        dispatchEvent: false
      });
      open = false;
      optionFocused.fill(false);
      triggerFocused = true;
    },
    measurePosition(menuHeight: number, viewportHeight = 800) {
      return computeAppearanceMenuCoords({
        trigger: { top: 600, right: 64, bottom: 640, left: 8, width: 56, height: 40 },
        menuHeight,
        menuWidth: APPEARANCE_MENU_WIDTH,
        viewportWidth: 1200,
        viewportHeight
      });
    }
  };
}

test("computeAppearanceMenuCoords opens below when space allows", () => {
  const coords = computeAppearanceMenuCoords({
    trigger: { top: 100, right: 70, bottom: 140, left: 10, width: 60, height: 40 },
    menuHeight: 120,
    viewportWidth: 1000,
    viewportHeight: 800
  });
  assert.equal(coords.top, 148);
  assert.equal(coords.left, 78);
});

test("computeAppearanceMenuCoords opens above when below space is insufficient", () => {
  const coords = computeAppearanceMenuCoords({
    trigger: { top: 700, right: 70, bottom: 740, left: 10, width: 60, height: 40 },
    menuHeight: 120,
    viewportWidth: 1000,
    viewportHeight: 800
  });
  assert.ok(coords.top < 700);
  assert.equal(coords.top, 700 - 8 - 120);
});

test("computeAppearanceMenuCoords clamps inside the viewport", () => {
  const coords = computeAppearanceMenuCoords({
    trigger: { top: 10, right: 980, bottom: 50, left: 920, width: 60, height: 40 },
    menuHeight: 200,
    menuWidth: 160,
    viewportWidth: 1000,
    viewportHeight: 220
  });
  assert.ok(coords.top >= 8);
  assert.ok(coords.left <= 1000 - 160 - 8);
  assert.ok(coords.left >= 8);
});

test("nextAppearanceMenuFocusIndex implements arrow home and end wrapping", () => {
  assert.equal(nextAppearanceMenuFocusIndex(0, "ArrowDown"), 1);
  assert.equal(nextAppearanceMenuFocusIndex(2, "ArrowDown"), 0);
  assert.equal(nextAppearanceMenuFocusIndex(0, "ArrowUp"), 2);
  assert.equal(nextAppearanceMenuFocusIndex(1, "Home"), 0);
  assert.equal(nextAppearanceMenuFocusIndex(0, "End"), 2);
  assert.equal(nextAppearanceMenuFocusIndex(1, "Tab"), null);
});

test("initial focus prefers the selected appearance option", () => {
  assert.equal(initialAppearanceMenuFocusIndex("system"), 0);
  assert.equal(initialAppearanceMenuFocusIndex("light"), 1);
  assert.equal(initialAppearanceMenuFocusIndex("dark"), 2);
  assert.equal(appearanceOptionIndex("light"), 1);
});

test("Appearance menu harness opens with selected option focused", () => {
  const menu = createMenuHarness("dark");
  menu.openMenu();
  assert.equal(menu.open, true);
  assert.equal(menu.focusIndex, 2);
  assert.deepEqual(menu.optionFocused, [false, false, true]);
  assert.equal(menu.dataTheme, "dark");
});

test("Enter or Space on trigger opens the menu", () => {
  const menu = createMenuHarness("system");
  menu.onKey("Enter");
  assert.equal(menu.open, true);
  assert.equal(menu.focusIndex, 0);
  const menu2 = createMenuHarness("light");
  menu2.onKey(" ");
  assert.equal(menu2.open, true);
  assert.equal(menu2.focusIndex, 1);
});

test("ArrowDown and ArrowUp move focus through System Light Dark", () => {
  const menu = createMenuHarness("system");
  menu.openMenu();
  menu.onKey("ArrowDown");
  assert.equal(menu.focusIndex, 1);
  menu.onKey("ArrowDown");
  assert.equal(menu.focusIndex, 2);
  menu.onKey("ArrowDown");
  assert.equal(menu.focusIndex, 0);
  menu.onKey("ArrowUp");
  assert.equal(menu.focusIndex, 2);
});

test("Home and End move to first and last option", () => {
  const menu = createMenuHarness("light");
  menu.openMenu();
  menu.onKey("End");
  assert.equal(menu.focusIndex, 2);
  menu.onKey("Home");
  assert.equal(menu.focusIndex, 0);
});

test("Enter selects focused option and updates storage plus data-theme", () => {
  const menu = createMenuHarness("system");
  menu.openMenu();
  menu.onKey("ArrowDown");
  menu.onKey("Enter");
  assert.equal(menu.open, false);
  assert.equal(menu.preference, "light");
  assert.equal(menu.dataTheme, "light");
  assert.equal(menu.stored, "light");
  assert.equal(menu.triggerFocused, true);
});

test("Space selects Dark and System clears data-theme", () => {
  const menu = createMenuHarness("system");
  menu.openMenu();
  menu.onKey("End");
  menu.onKey(" ");
  assert.equal(menu.preference, "dark");
  assert.equal(menu.dataTheme, "dark");
  assert.equal(menu.stored, "dark");

  menu.openMenu();
  menu.onKey("Home");
  menu.onKey("Enter");
  assert.equal(menu.preference, "system");
  assert.equal(menu.dataTheme, null);
  assert.equal(menu.stored, null);
});

test("Escape closes the menu and restores trigger focus", () => {
  const menu = createMenuHarness("light");
  menu.openMenu();
  menu.onKey("Escape");
  assert.equal(menu.open, false);
  assert.equal(menu.triggerFocused, true);
  assert.deepEqual(menu.optionFocused, [false, false, false]);
});

test("outside click closes without forcing trigger focus", () => {
  const menu = createMenuHarness("light");
  menu.openMenu();
  menu.closeViaOutsideClick();
  assert.equal(menu.open, false);
  assert.equal(menu.triggerFocused, false);
});

test("measured positioning uses popup height instead of a hard-coded 120px", () => {
  const short = createMenuHarness().measurePosition(80, 800);
  const tall = createMenuHarness().measurePosition(200, 800);
  // Near bottom trigger (top 600): tall menu flips above more aggressively.
  assert.ok(tall.top <= short.top);
  assert.notEqual(short.top, 640 - 120);
});

test("click selection applies themes", () => {
  const menu = createMenuHarness("system");
  menu.selectByClick("light");
  assert.equal(menu.dataTheme, "light");
  menu.selectByClick("dark");
  assert.equal(menu.dataTheme, "dark");
  menu.selectByClick("system");
  assert.equal(menu.dataTheme, null);
});
