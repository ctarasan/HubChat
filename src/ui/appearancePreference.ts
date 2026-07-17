/** Browser appearance preference: System / Light / Dark (local only). */

export type AppearancePreference = "system" | "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "hubchat.appearance";

export const APPEARANCE_CHANGE_EVENT = "hubchat:appearance";

export const APPEARANCE_OPTIONS: ReadonlyArray<{
  value: AppearancePreference;
  label: string;
}> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" }
];

export function parseAppearancePreference(raw: unknown): AppearancePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function readAppearancePreference(
  storage: Pick<Storage, "getItem"> | null | undefined = globalThis.localStorage
): AppearancePreference {
  if (!storage) return "system";
  try {
    return parseAppearancePreference(storage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeAppearancePreference(
  preference: AppearancePreference,
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined = globalThis.localStorage
): void {
  if (!storage) return;
  try {
    if (preference === "system") {
      storage.removeItem(APPEARANCE_STORAGE_KEY);
    } else {
      storage.setItem(APPEARANCE_STORAGE_KEY, preference);
    }
  } catch {
    // Storage may be unavailable (private mode / quota); preference still applies in-DOM.
  }
}

/** Apply preference to the document root. System removes data-theme so CSS media query applies. */
export function applyAppearanceToDocument(
  preference: AppearancePreference,
  root: HTMLElement | null | undefined = typeof document !== "undefined" ? document.documentElement : null
): void {
  if (!root) return;
  const resolved = parseAppearancePreference(preference);
  if (resolved === "light" || resolved === "dark") {
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  } else {
    root.removeAttribute("data-theme");
    root.style.colorScheme = "";
  }
}

export function setAppearancePreference(
  preference: AppearancePreference,
  options?: {
    storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
    root?: HTMLElement | null;
    dispatchEvent?: boolean;
  }
): AppearancePreference {
  const resolved = parseAppearancePreference(preference);
  writeAppearancePreference(resolved, options?.storage ?? globalThis.localStorage);
  applyAppearanceToDocument(resolved, options?.root);
  if (options?.dispatchEvent !== false && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, { detail: resolved }));
    } catch {
      // ignore
    }
  }
  return resolved;
}

/**
 * Inline bootstrap for app/layout.tsx — runs before paint; no React dependency.
 * Keep in sync with applyAppearanceToDocument / parseAppearancePreference.
 */
export const APPEARANCE_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(APPEARANCE_STORAGE_KEY)};var v=null;try{v=localStorage.getItem(k);}catch(e){}if(v!=="light"&&v!=="dark"&&v!=="system")v="system";var r=document.documentElement;if(v==="light"||v==="dark"){r.setAttribute("data-theme",v);r.style.colorScheme=v;}else{r.removeAttribute("data-theme");r.style.colorScheme="";}}catch(e){}})();`;
