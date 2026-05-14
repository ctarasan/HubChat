import test from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_STORAGE_KEY,
  clearSessionConfig,
  hasRequiredSessionConfig,
  loadSessionConfig,
  normalizeSessionConfig,
  saveSessionConfig
} from "./sessionConfig.js";

function makeStorage() {
  const data: Record<string, string> = {};
  return {
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    }
  };
}

test("session config save and load roundtrip", () => {
  const storage = makeStorage();
  saveSessionConfig(storage, {
    baseUrl: " https://example.com ",
    tenantId: "  tenant-1 ",
    accessToken: "  token-1 "
  });
  const loaded = loadSessionConfig(storage);
  assert.equal(loaded.baseUrl, "https://example.com");
  assert.equal(loaded.tenantId, "tenant-1");
  assert.equal(loaded.accessToken, "token-1");
});

test("session config load handles invalid JSON safely", () => {
  const storage = makeStorage();
  storage.setItem(SESSION_STORAGE_KEY, "{invalid-json");
  const loaded = loadSessionConfig(storage);
  assert.equal(typeof loaded.baseUrl, "string");
  assert.equal(loaded.tenantId, "");
  assert.equal(loaded.accessToken, "");
});

test("required session config check works", () => {
  assert.equal(hasRequiredSessionConfig({ baseUrl: "https://x.com", tenantId: "a", accessToken: "b" }), true);
  assert.equal(hasRequiredSessionConfig({ baseUrl: "https://x.com", tenantId: "", accessToken: "b" }), false);
});

test("session config clearSessionConfig removes storage key", () => {
  const storage = makeStorage();
  saveSessionConfig(storage, {
    baseUrl: "https://example.com",
    tenantId: "t1",
    accessToken: "tok"
  });
  assert.ok(storage.getItem(SESSION_STORAGE_KEY));
  clearSessionConfig(storage);
  assert.equal(storage.getItem(SESSION_STORAGE_KEY), null);
});
