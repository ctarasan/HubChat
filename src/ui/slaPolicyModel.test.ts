import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultTenantSlaPolicy } from "../domain/tenantSlaPolicy.js";
import {
  apiDataToFormState,
  apiDataToPageMeta,
  formStateToPatchBody,
  isSlaPolicyConflictResponse,
  isSlaPolicyFormDirty,
  mapSlaPolicySaveError,
  minutesToUnitValue,
  parseSlaPolicyGetResponse,
  pickDisplayUnit,
  SLA_POLICY_CONFLICT_MESSAGE_TH,
  unitValueToMinutes,
  validateSlaPolicyForm,
  type SlaPolicyApiData
} from "./slaPolicyModel.js";

/** Explicit API fixture (simulates GET /api/sla-policy default response). */
function fixtureApiData(overrides?: Partial<SlaPolicyApiData>): SlaPolicyApiData {
  const basePolicy = buildDefaultTenantSlaPolicy();
  return {
    source: "default",
    persisted: false,
    enabled: basePolicy.enabled,
    warningBeforeBreachMinutes: basePolicy.warningBeforeBreachMinutes,
    excludeResolved: basePolicy.excludeResolved,
    excludeArchived: basePolicy.excludeArchived,
    rules: basePolicy.rules,
    version: basePolicy.version,
    updatedAt: null,
    updatedBy: null,
    deferredFields: {
      businessHours: "not_supported",
      channelOverrides: "not_supported",
      auditHistory: "not_supported"
    },
    ...overrides
  };
}

test("unitValueToMinutes and minutesToUnitValue convert minutes hours days", () => {
  assert.equal(unitValueToMinutes(90, "minutes"), 90);
  assert.equal(unitValueToMinutes(2, "hours"), 120);
  assert.equal(unitValueToMinutes(1, "days"), 1440);
  assert.equal(minutesToUnitValue(120, "hours"), 2);
  assert.equal(pickDisplayUnit(1440), "days");
});

test("apiDataToFormState maps API policy to editable form", () => {
  const data = fixtureApiData({
    warningBeforeBreachMinutes: 120,
    rules: {
      ...fixtureApiData().rules,
      NEW_FIRST_RESPONSE: {
        enabled: true,
        targetMinutes: 90,
        warningBeforeBreachMinutes: null,
        label: "First response"
      }
    }
  });
  const form = apiDataToFormState(data);
  assert.equal(form.warningValue, "2");
  assert.equal(form.warningUnit, "hours");
  assert.equal(form.rules.NEW_FIRST_RESPONSE.targetValue, "90");
  assert.equal(form.rules.NEW_FIRST_RESPONSE.targetUnit, "minutes");
});

test("formStateToPatchBody omits deferred fields and converts units to minutes", () => {
  const data = fixtureApiData();
  const form = apiDataToFormState(data);
  form.rules.NEW_FIRST_RESPONSE.enabled = true;
  form.rules.NEW_FIRST_RESPONSE.targetValue = "1";
  form.rules.NEW_FIRST_RESPONSE.targetUnit = "days";
  form.warningValue = "3";
  form.warningUnit = "hours";

  const body = formStateToPatchBody(form);
  assert.equal(body.warningBeforeBreachMinutes, 180);
  assert.equal(body.rules.NEW_FIRST_RESPONSE.targetMinutes, 1440);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "businessHours"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "channelOverrides"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "auditHistory"), false);
});

test("validateSlaPolicyForm requires target when rule enabled", () => {
  const form = apiDataToFormState(fixtureApiData());
  form.rules.NEW_FIRST_RESPONSE.enabled = true;
  form.rules.NEW_FIRST_RESPONSE.targetValue = "";
  const result = validateSlaPolicyForm(form);
  assert.equal(result.valid, false);
  assert.ok(result.errors["rule.NEW_FIRST_RESPONSE.target"]);
});

test("validateSlaPolicyForm requires per-rule warning less than target", () => {
  const form = apiDataToFormState(fixtureApiData());
  form.rules.NEW_FIRST_RESPONSE.enabled = true;
  form.rules.NEW_FIRST_RESPONSE.targetValue = "60";
  form.rules.NEW_FIRST_RESPONSE.targetUnit = "minutes";
  form.rules.NEW_FIRST_RESPONSE.warningOverrideValue = "2";
  form.rules.NEW_FIRST_RESPONSE.warningOverrideUnit = "hours";
  const result = validateSlaPolicyForm(form);
  assert.equal(result.valid, false);
  assert.ok(result.errors["rule.NEW_FIRST_RESPONSE.warning"]);
});

test("disabled rule allows null target in patch body", () => {
  const form = apiDataToFormState(fixtureApiData());
  form.rules.NEW_FIRST_RESPONSE.enabled = false;
  form.rules.NEW_FIRST_RESPONSE.targetValue = "";
  const body = formStateToPatchBody(form);
  assert.equal(body.rules.NEW_FIRST_RESPONSE.targetMinutes, null);
});

test("apiDataToPageMeta handles default source and persisted false", () => {
  const meta = apiDataToPageMeta(fixtureApiData());
  assert.equal(meta.source, "default");
  assert.equal(meta.persisted, false);
  assert.equal(meta.updatedAt, null);
});

test("isSlaPolicyFormDirty detects changes", () => {
  const form = apiDataToFormState(fixtureApiData());
  const baseline = apiDataToFormState(fixtureApiData());
  assert.equal(isSlaPolicyFormDirty(form, baseline), false);
  form.enabled = false;
  assert.equal(isSlaPolicyFormDirty(form, baseline), true);
});

test("mapSlaPolicySaveError maps 409 conflict message", () => {
  assert.equal(mapSlaPolicySaveError(409, {}), SLA_POLICY_CONFLICT_MESSAGE_TH);
  assert.equal(isSlaPolicyConflictResponse(409), true);
});

test("parseSlaPolicyGetResponse accepts valid payload", () => {
  const parsed = parseSlaPolicyGetResponse({ data: fixtureApiData() });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.data.source, "default");
});
