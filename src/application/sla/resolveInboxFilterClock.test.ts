import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadInboxFilterClockForTenant, loadInboxSlaListContextForTenant } from "./resolveInboxFilterClock.js";
import { utcInboxFilterClock } from "../../interfaces/api/conversationListInboxFilters.js";
import { buildDefaultTenantSlaPolicy } from "../../domain/tenantSlaPolicy.js";

const TENANT_ID = "ba82d847-53cd-4b60-9e4d-5fd3f8ad865f";

test("loadInboxFilterClockForTenant uses tenant policy warningBeforeBreachMinutes", async () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const clock = await loadInboxFilterClockForTenant(
    TENANT_ID,
    now,
    {
      findByTenantId: async () => ({
        ...buildDefaultTenantSlaPolicy(),
        tenantId: TENANT_ID,
        warningBeforeBreachMinutes: 33,
        updatedAt: now.toISOString(),
        updatedByAuthUserId: null
      })
    },
    {}
  );
  assert.deepEqual(clock, utcInboxFilterClock(now, 33));
});

test("loadInboxSlaListContextForTenant returns clock and warning minutes", async () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const context = await loadInboxSlaListContextForTenant(TENANT_ID, now, {
    findByTenantId: async () => ({
      ...buildDefaultTenantSlaPolicy(),
      tenantId: TENANT_ID,
      warningBeforeBreachMinutes: 48,
      updatedAt: now.toISOString(),
      updatedByAuthUserId: null
    })
  });
  assert.equal(context.warningBeforeBreachMinutes, 48);
  assert.deepEqual(context.inboxFilterClock, utcInboxFilterClock(now, 48));
});

test("loadInboxFilterClockForTenant falls back to default factory when tenant row missing", async () => {
  const now = new Date("2026-05-15T12:00:00.000Z");
  const clock = await loadInboxFilterClockForTenant(TENANT_ID, now, {
    findByTenantId: async () => null
  });
  assert.deepEqual(
    clock,
    utcInboxFilterClock(now, buildDefaultTenantSlaPolicy().warningBeforeBreachMinutes)
  );
});

const RUNTIME_SCAN_ROOTS = ["src", "app/api"];
const RUNTIME_SCAN_SKIP_SUFFIXES = [".test.ts", ".test.tsx"];
const FORBIDDEN_RUNTIME_PATTERNS = [/7200000/, /DEFAULT_SLA_DUE_SOON_MS/, /2 \* 60 \* 60 \* 1000/];

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      collectTsFiles(path, out);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (RUNTIME_SCAN_SKIP_SUFFIXES.some((suffix) => name.endsWith(suffix))) continue;
    out.push(path);
  }
  return out;
}

test("grep guard: no hard-coded 2h due-soon constants in production runtime paths", () => {
  const violations: string[] = [];
  for (const root of RUNTIME_SCAN_ROOTS) {
    for (const file of collectTsFiles(root)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_RUNTIME_PATTERNS) {
        if (pattern.test(text)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }
  }
  assert.deepEqual(violations, []);
});
