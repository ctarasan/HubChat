import test from "node:test";
import assert from "node:assert/strict";
import {
  buildListSlaPageInfoFields,
  readListSlaWarningBeforeBreachMinutes,
  resolveSlaDueSoonMsFromBadgeOptions,
  resolveSlaDueSoonMsFromPageInfo
} from "./listSlaPageInfo.js";
import { buildDefaultTenantSlaPolicy, slaDueSoonMsFromWarningMinutes } from "../../domain/tenantSlaPolicy.js";

test("buildListSlaPageInfoFields exposes warning minutes on pageInfo", () => {
  assert.deepEqual(buildListSlaPageInfoFields(90), { slaWarningBeforeBreachMinutes: 90 });
});

test("readListSlaWarningBeforeBreachMinutes reads camelCase and snake_case", () => {
  assert.equal(readListSlaWarningBeforeBreachMinutes({ slaWarningBeforeBreachMinutes: 45 }), 45);
  assert.equal(readListSlaWarningBeforeBreachMinutes({ sla_warning_before_breach_minutes: 30 }), 30);
  assert.equal(readListSlaWarningBeforeBreachMinutes({ slaWarningBeforeBreachMinutes: 0 }), null);
  assert.equal(readListSlaWarningBeforeBreachMinutes(null), null);
});

test("resolveSlaDueSoonMsFromPageInfo uses pageInfo minutes or default factory", () => {
  assert.equal(resolveSlaDueSoonMsFromPageInfo({ slaWarningBeforeBreachMinutes: 40 }), slaDueSoonMsFromWarningMinutes(40));
  assert.equal(
    resolveSlaDueSoonMsFromPageInfo({ nextCursor: null }),
    slaDueSoonMsFromWarningMinutes(buildDefaultTenantSlaPolicy().warningBeforeBreachMinutes)
  );
});

test("resolveSlaDueSoonMsFromBadgeOptions uses injected minutes or default factory", () => {
  assert.equal(
    resolveSlaDueSoonMsFromBadgeOptions({ slaWarningBeforeBreachMinutes: 25 }),
    slaDueSoonMsFromWarningMinutes(25)
  );
  assert.equal(
    resolveSlaDueSoonMsFromBadgeOptions(undefined),
    slaDueSoonMsFromWarningMinutes(buildDefaultTenantSlaPolicy().warningBeforeBreachMinutes)
  );
});
