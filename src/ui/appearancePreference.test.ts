import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  APPEARANCE_BOOTSTRAP_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  applyAppearanceToDocument,
  parseAppearancePreference,
  readAppearancePreference,
  setAppearancePreference,
  writeAppearancePreference
} from "./appearancePreference.js";

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

test("parseAppearancePreference accepts only system light dark", () => {
  assert.equal(parseAppearancePreference("system"), "system");
  assert.equal(parseAppearancePreference("light"), "light");
  assert.equal(parseAppearancePreference("dark"), "dark");
  assert.equal(parseAppearancePreference("DARK"), "system");
  assert.equal(parseAppearancePreference(""), "system");
  assert.equal(parseAppearancePreference(null), "system");
  assert.equal(parseAppearancePreference(undefined), "system");
  assert.equal(parseAppearancePreference("{}"), "system");
});

test("readAppearancePreference falls back on missing or invalid storage values", () => {
  assert.equal(readAppearancePreference(memoryStorage()), "system");
  assert.equal(readAppearancePreference(memoryStorage({ [APPEARANCE_STORAGE_KEY]: "light" })), "light");
  assert.equal(readAppearancePreference(memoryStorage({ [APPEARANCE_STORAGE_KEY]: "nope" })), "system");
  assert.equal(readAppearancePreference(null), "system");
});

test("writeAppearancePreference stores light/dark and clears system", () => {
  const storage = memoryStorage({ [APPEARANCE_STORAGE_KEY]: "dark" });
  writeAppearancePreference("light", storage);
  assert.equal(storage.getItem(APPEARANCE_STORAGE_KEY), "light");
  writeAppearancePreference("system", storage);
  assert.equal(storage.getItem(APPEARANCE_STORAGE_KEY), null);
});

test("writeAppearancePreference tolerates storage failures", () => {
  const broken = {
    setItem() {
      throw new Error("quota");
    },
    removeItem() {
      throw new Error("quota");
    }
  };
  assert.doesNotThrow(() => writeAppearancePreference("dark", broken));
  assert.doesNotThrow(() => writeAppearancePreference("system", broken));
});

test("applyAppearanceToDocument sets and clears data-theme", () => {
  const root = {
    attrs: new Map<string, string>(),
    style: { colorScheme: "" },
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    removeAttribute(name: string) {
      this.attrs.delete(name);
    },
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    }
  };
  applyAppearanceToDocument("light", root as unknown as HTMLElement);
  assert.equal(root.getAttribute("data-theme"), "light");
  assert.equal(root.style.colorScheme, "light");
  applyAppearanceToDocument("dark", root as unknown as HTMLElement);
  assert.equal(root.getAttribute("data-theme"), "dark");
  assert.equal(root.style.colorScheme, "dark");
  applyAppearanceToDocument("system", root as unknown as HTMLElement);
  assert.equal(root.getAttribute("data-theme"), null);
  assert.equal(root.style.colorScheme, "");
});

test("setAppearancePreference persists and applies preference", () => {
  const storage = memoryStorage();
  const root = {
    attrs: new Map<string, string>(),
    style: { colorScheme: "" },
    setAttribute(name: string, value: string) {
      this.attrs.set(name, value);
    },
    removeAttribute(name: string) {
      this.attrs.delete(name);
    },
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    }
  };
  const next = setAppearancePreference("dark", {
    storage,
    root: root as unknown as HTMLElement,
    dispatchEvent: false
  });
  assert.equal(next, "dark");
  assert.equal(storage.getItem(APPEARANCE_STORAGE_KEY), "dark");
  assert.equal(root.getAttribute("data-theme"), "dark");
});

test("bootstrap script matches storage key and validates values", () => {
  assert.match(APPEARANCE_BOOTSTRAP_SCRIPT, new RegExp(APPEARANCE_STORAGE_KEY.replace(".", "\\.")));
  assert.match(APPEARANCE_BOOTSTRAP_SCRIPT, /data-theme/);
  assert.match(APPEARANCE_BOOTSTRAP_SCRIPT, /colorScheme/);
  assert.match(APPEARANCE_BOOTSTRAP_SCRIPT, /try\{/);
});

test("layout includes appearance bootstrap script", () => {
  const layout = readFileSync(new URL("../../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /APPEARANCE_BOOTSTRAP_SCRIPT/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /dangerouslySetInnerHTML/);
});

test("AppearanceMenu uses radio-menu semantics with keyboard support", () => {
  const source = readFileSync(new URL("./AppearanceMenu.tsx", import.meta.url), "utf8");
  assert.match(source, /appearance-menu-trigger/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /role="menu"/);
  assert.match(source, /role="menuitemradio"/);
  assert.match(source, /aria-checked/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /Escape/);
  assert.match(source, /computeAppearanceMenuCoords/);
  assert.match(source, /position:\s*fixed|appearance-menu-list/);
  assert.equal(source.includes('role="listbox"'), false);
  assert.equal(source.includes('role="option"'), false);
});

test("DashboardAppRail always renders AppearanceMenu in footer", () => {
  const rail = readFileSync(new URL("./DashboardAppRail.tsx", import.meta.url), "utf8");
  assert.match(rail, /AppearanceMenu/);
  assert.match(rail, /app-rail-footer/);
});
