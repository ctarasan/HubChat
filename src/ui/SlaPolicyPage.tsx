"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { clearSessionConfig, hasRequiredSessionConfig, loadSessionConfig, type SessionConfig } from "./sessionConfig.js";
import { canAccessSlaPolicyPage, canEditSlaPolicy } from "./dashboardNavAccess.js";
import {
  DashboardAppRail,
  DashboardAppRailSetupLink,
  DashboardAppRailSignOutButton
} from "./DashboardAppRail.js";
import { DeploymentEnvironmentBanner } from "./DeploymentEnvironmentBanner.js";
import {
  apiDataToFormState,
  apiDataToPageMeta,
  buildSlaPolicyPreviewItems,
  buildSlaPolicySummaryCards,
  formatSlaPolicyUpdatedAt,
  formStateToPatchBody,
  isSlaPolicyConflictResponse,
  isSlaPolicyFormDirty,
  mapSlaPolicyLoadError,
  mapSlaPolicySaveError,
  parseSlaPolicyGetResponse,
  parseSlaPolicyPatchResponse,
  SLA_POLICY_CONFLICT_MESSAGE_TH,
  SLA_POLICY_RULE_META,
  SLA_POLICY_RULE_ORDER,
  sourcePolicyBadgeLabel,
  type SlaPolicyFormState,
  type SlaPolicyPageMeta,
  type SlaPolicyRuleKey,
  type SlaTimeUnit,
  validateSlaPolicyForm
} from "./slaPolicyModel.js";

type MeContext = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

async function fetchWithTenantHeaders(
  session: SessionConfig,
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<{ res: Response; body: unknown }> {
  const res = await fetch(`${session.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "x-tenant-id": tenantId,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { res, body };
}

function resolveTenantId(me: MeContext | null, session: SessionConfig): string {
  return me?.tenantId?.trim() || session.tenantId.trim();
}

const TIME_UNIT_OPTIONS: { value: SlaTimeUnit; label: string }[] = [
  { value: "minutes", label: "นาที" },
  { value: "hours", label: "ชั่วโมง" },
  { value: "days", label: "วัน" }
];

export default function SlaPolicyPage() {
  const [session, setSession] = useState<SessionConfig | null>(null);
  const [meContext, setMeContext] = useState<MeContext | null>(null);
  const [meError, setMeError] = useState("");
  const [meta, setMeta] = useState<SlaPolicyPageMeta | null>(null);
  const [form, setForm] = useState<SlaPolicyFormState | null>(null);
  const [baseline, setBaseline] = useState<SlaPolicyFormState | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [conflictMessage, setConflictMessage] = useState("");

  useEffect(() => {
    setSession(loadSessionConfig(globalThis.localStorage));
  }, []);

  const applyLoadedPolicy = useCallback((parsed: ReturnType<typeof parseSlaPolicyGetResponse> & { ok: true }) => {
    const nextForm = apiDataToFormState(parsed.data);
    setMeta(apiDataToPageMeta(parsed.data));
    setForm(nextForm);
    setBaseline(nextForm);
    setConflictMessage("");
  }, []);

  const loadPolicy = useCallback(async () => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    setLoadBusy(true);
    setLoadError("");
    setSaveError("");
    setSaveSuccess("");
    try {
      let me = meContext;
      if (!me) {
        const meRes = await fetchWithTenantHeaders(session, session.tenantId, "/api/me");
        if (!meRes.res.ok) {
          setMeError(mapSlaPolicyLoadError(meRes.res.status, meRes.body));
          return;
        }
        const meBody = meRes.body as { data?: MeContext };
        me = meBody.data ?? null;
        setMeContext(me);
      }
      if (!me || !canAccessSlaPolicyPage(me.role)) {
        setMeError("");
        return;
      }
      const tenantId = resolveTenantId(me, session);
      const { res, body } = await fetchWithTenantHeaders(session, tenantId, "/api/sla-policy");
      if (!res.ok) {
        setLoadError(mapSlaPolicyLoadError(res.status, body));
        return;
      }
      const parsed = parseSlaPolicyGetResponse(body);
      if (!parsed.ok) {
        setLoadError(parsed.error);
        return;
      }
      applyLoadedPolicy(parsed);
    } finally {
      setLoadBusy(false);
    }
  }, [session, meContext, applyLoadedPolicy]);

  useEffect(() => {
    if (!session || !hasRequiredSessionConfig(session)) return;
    void loadPolicy();
  }, [session, loadPolicy]);

  const canAccess = Boolean(meContext && canAccessSlaPolicyPage(meContext.role) && !meError);
  const canEdit = Boolean(meContext && canEditSlaPolicy(meContext.role));
  const validation = useMemo(
    () => (form ? validateSlaPolicyForm(form) : { valid: false, errors: {} }),
    [form]
  );
  const dirty = Boolean(form && baseline && isSlaPolicyFormDirty(form, baseline));
  const summaryCards = useMemo(() => (form ? buildSlaPolicySummaryCards(form) : []), [form]);
  const previewItems = useMemo(() => (form ? buildSlaPolicyPreviewItems(form) : []), [form]);

  function patchForm(patch: Partial<SlaPolicyFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveSuccess("");
    setConflictMessage("");
  }

  function patchRule(key: SlaPolicyRuleKey, patch: Partial<SlaPolicyFormState["rules"][SlaPolicyRuleKey]>) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rules: {
          ...prev.rules,
          [key]: { ...prev.rules[key], ...patch }
        }
      };
    });
    setSaveSuccess("");
    setConflictMessage("");
  }

  async function savePolicy() {
    if (!session || !form || !canEdit) return;
    const check = validateSlaPolicyForm(form);
    if (!check.valid) {
      setSaveError("ไม่สามารถบันทึกได้ กรุณาตรวจสอบข้อมูล");
      return;
    }
    setSaveBusy(true);
    setSaveError("");
    setSaveSuccess("");
    setConflictMessage("");
    try {
      const tenantId = resolveTenantId(meContext, session);
      const { res, body } = await fetchWithTenantHeaders(session, tenantId, "/api/sla-policy", {
        method: "PATCH",
        body: JSON.stringify(formStateToPatchBody(form))
      });
      if (!res.ok) {
        const message = mapSlaPolicySaveError(res.status, body);
        setSaveError(message);
        if (isSlaPolicyConflictResponse(res.status)) {
          setConflictMessage(SLA_POLICY_CONFLICT_MESSAGE_TH);
        }
        return;
      }
      const parsed = parseSlaPolicyPatchResponse(body);
      if (!parsed.ok) {
        setSaveError(parsed.error);
        return;
      }
      applyLoadedPolicy(parsed);
      setSaveSuccess("บันทึก SLA Policy แล้ว");
    } finally {
      setSaveBusy(false);
    }
  }

  function resetChanges() {
    if (baseline) {
      setForm(baseline);
      setSaveError("");
      setSaveSuccess("");
      setConflictMessage("");
    }
  }

  if (!session || !hasRequiredSessionConfig(session)) {
    return (
      <main className="sla-policy-root" data-testid="sla-policy-page">
        <div className="sla-policy-main">
          <p>
            Missing session.{" "}
            <a href="/login" className="primary-link">
              Sign in
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="sla-policy-root" data-testid="sla-policy-page">
      <DashboardAppRail
        activeId="sla"
        role={meContext?.role}
        footer={
          <>
            <DashboardAppRailSignOutButton
              testId="sla-policy-sign-out"
              onSignOut={() => {
                clearSessionConfig(globalThis.localStorage);
                window.location.replace("/login");
              }}
            />
            <DashboardAppRailSetupLink />
          </>
        }
      />

      <section className="sla-policy-main">
        <DeploymentEnvironmentBanner />
        {meError ? <div className="card error">{meError}</div> : null}

        {meContext && !canAccessSlaPolicyPage(meContext.role) ? (
          <div className="card sla-policy-access-denied" data-testid="sla-policy-access-denied">
            <h2>Access denied</h2>
            <p className="hint">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
            <a href="/dashboard" className="primary-link">
              Back to Team Inbox
            </a>
          </div>
        ) : canAccess ? (
          <>
            <header className="team-members-header team-members-header-hero sla-policy-header">
              <div className="team-members-header-text">
                <p className="team-members-eyebrow">Configuration</p>
                <h2>ตั้งค่า SLA</h2>
                <p className="team-members-subtitle">
                  กำหนดมาตรฐานเวลาการตอบกลับและการติดตาม Lead สำหรับทีม
                </p>
                {meta ? (
                  <div className="sla-policy-header-meta">
                    <span className="inbox-badge sla-policy-source-badge" data-testid="sla-policy-source-badge">
                      {sourcePolicyBadgeLabel(meta.source)}
                    </span>
                    {meta.source === "default" ? (
                      <p className="hint" data-testid="sla-policy-default-notice">
                        ยังไม่มี SLA Policy สำหรับ tenant นี้ ระบบกำลังแสดงค่าเริ่มต้นที่สามารถบันทึกเป็น policy ได้
                      </p>
                    ) : null}
                    {meta.updatedAt ? (
                      <p className="hint" data-testid="sla-policy-updated-at">
                        อัปเดตล่าสุด {formatSlaPolicyUpdatedAt(meta.updatedAt)}
                        {meta.updatedByDisplay ? ` · ${meta.updatedByDisplay}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="team-members-add-btn sla-policy-reload-btn"
                data-testid="sla-policy-reload"
                disabled={loadBusy}
                onClick={() => void loadPolicy()}
              >
                {loadBusy ? "Loading…" : "Reload"}
              </button>
            </header>

            {!canEdit ? (
              <div className="card sla-policy-readonly-banner" data-testid="sla-policy-readonly-banner" role="status">
                คุณมีสิทธิ์ดู SLA Policy แต่ไม่สามารถแก้ไขได้
              </div>
            ) : null}

            {loadError ? (
              <div className="card error" data-testid="sla-policy-load-error" role="alert">
                {loadError}
              </div>
            ) : null}
            {saveError ? (
              <div className="card error" data-testid="sla-policy-save-error" role="alert">
                {saveError}
              </div>
            ) : null}
            {conflictMessage ? (
              <div className="card error sla-policy-conflict" data-testid="sla-policy-conflict" role="alert">
                {conflictMessage}
              </div>
            ) : null}
            {saveSuccess ? (
              <div className="card success sla-policy-save-success" data-testid="sla-policy-save-success" role="status">
                {saveSuccess}
              </div>
            ) : null}
            {dirty ? (
              <p className="hint sla-policy-dirty-hint" data-testid="sla-policy-unsaved">
                มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก
              </p>
            ) : null}

            {loadBusy && !form ? (
              <div className="sla-policy-loading" data-testid="sla-policy-loading" aria-live="polite">
                <div className="sla-policy-skeleton card" />
                <div className="sla-policy-skeleton card" />
              </div>
            ) : null}

            {form ? (
              <div className="sla-policy-layout">
                <div className="sla-policy-primary">
                  <section className="sla-policy-summary-grid" aria-label="SLA summary">
                    {summaryCards.map((card) => (
                      <article key={card.id} className="card sla-policy-summary-card" data-testid={`sla-summary-${card.id}`}>
                        <p className="sla-policy-summary-label">{card.label}</p>
                        <p className="sla-policy-summary-value">{card.value}</p>
                        {card.hint ? <p className="hint">{card.hint}</p> : null}
                      </article>
                    ))}
                  </section>

                  <section className="card sla-policy-rules-card" data-testid="sla-policy-rules-card">
                    <h3>SLA ตาม Rule / Stage</h3>
                    <div className="sla-policy-rules-list">
                      {SLA_POLICY_RULE_ORDER.map((key) => {
                        const rule = form.rules[key];
                        const metaRule = SLA_POLICY_RULE_META[key];
                        const targetError = validation.errors[`rule.${key}.target`];
                        const warningError = validation.errors[`rule.${key}.warning`];
                        return (
                          <article key={key} className="sla-policy-rule-row" data-testid={`sla-rule-${key}`}>
                            <header className="sla-policy-rule-head">
                              <div>
                                <h4>{metaRule.titleEn}</h4>
                                <p className="hint">{metaRule.titleTh}</p>
                              </div>
                              <label className="sla-policy-toggle">
                                <span>เปิดใช้งาน</span>
                                <input
                                  type="checkbox"
                                  checked={rule.enabled}
                                  disabled={!canEdit}
                                  data-testid={`sla-rule-enabled-${key}`}
                                  onChange={(e) => patchRule(key, { enabled: e.target.checked })}
                                />
                              </label>
                            </header>
                            <p className="hint sla-policy-rule-behavior">{metaRule.behavior}</p>
                            {metaRule.runtimeDeferred ? (
                              <p className="hint sla-policy-runtime-deferred" data-testid={`sla-rule-deferred-${key}`}>
                                หมายเหตุ: runtime follow-up SLA อาจยังไม่เปิดใช้ — เก็บเป็นค่า policy ได้
                              </p>
                            ) : null}
                            <div className="sla-policy-rule-fields">
                              <label className="sla-policy-field">
                                <span>เป้าหมาย SLA</span>
                                <div className="sla-policy-duration-input">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={rule.targetValue}
                                    disabled={!canEdit || !rule.enabled}
                                    data-testid={`sla-rule-target-value-${key}`}
                                    onChange={(e) => patchRule(key, { targetValue: e.target.value })}
                                  />
                                  <select
                                    value={rule.targetUnit}
                                    disabled={!canEdit || !rule.enabled}
                                    data-testid={`sla-rule-target-unit-${key}`}
                                    onChange={(e) =>
                                      patchRule(key, { targetUnit: e.target.value as SlaTimeUnit })
                                    }
                                  >
                                    {TIME_UNIT_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {targetError ? (
                                  <span className="sla-policy-field-error" role="alert">
                                    {targetError}
                                  </span>
                                ) : null}
                              </label>
                              <label className="sla-policy-field">
                                <span>เตือนก่อนครบ (เว้นว่าง = ใช้ค่าทั้งระบบ)</span>
                                <div className="sla-policy-duration-input">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={rule.warningOverrideValue}
                                    disabled={!canEdit || !rule.enabled}
                                    data-testid={`sla-rule-warning-value-${key}`}
                                    onChange={(e) =>
                                      patchRule(key, { warningOverrideValue: e.target.value })
                                    }
                                  />
                                  <select
                                    value={rule.warningOverrideUnit}
                                    disabled={!canEdit || !rule.enabled}
                                    data-testid={`sla-rule-warning-unit-${key}`}
                                    onChange={(e) =>
                                      patchRule(key, {
                                        warningOverrideUnit: e.target.value as SlaTimeUnit
                                      })
                                    }
                                  >
                                    {TIME_UNIT_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {warningError ? (
                                  <span className="sla-policy-field-error" role="alert">
                                    {warningError}
                                  </span>
                                ) : null}
                              </label>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="card sla-policy-options-card" data-testid="sla-policy-options-card">
                    <h3>ตัวเลือก Policy</h3>
                    <label className="sla-policy-toggle sla-policy-field-block">
                      <span>เปิดใช้งาน SLA Policy</span>
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        disabled={!canEdit}
                        data-testid="sla-policy-enabled"
                        onChange={(e) => patchForm({ enabled: e.target.checked })}
                      />
                    </label>
                    <label className="sla-policy-field sla-policy-field-block">
                      <span>เตือนก่อนครบ SLA (ทั้งระบบ)</span>
                      <div className="sla-policy-duration-input">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={form.warningValue}
                          disabled={!canEdit}
                          data-testid="sla-policy-global-warning-value"
                          onChange={(e) => patchForm({ warningValue: e.target.value })}
                        />
                        <select
                          value={form.warningUnit}
                          disabled={!canEdit}
                          data-testid="sla-policy-global-warning-unit"
                          onChange={(e) => patchForm({ warningUnit: e.target.value as SlaTimeUnit })}
                        >
                          {TIME_UNIT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {validation.errors["global.warning"] ? (
                        <span className="sla-policy-field-error" role="alert">
                          {validation.errors["global.warning"]}
                        </span>
                      ) : null}
                    </label>
                    <label className="sla-policy-toggle sla-policy-field-block">
                      <span>ไม่นับ SLA เมื่อ conversation เป็น Resolved</span>
                      <input
                        type="checkbox"
                        checked={form.excludeResolved}
                        disabled={!canEdit}
                        data-testid="sla-policy-exclude-resolved"
                        onChange={(e) => patchForm({ excludeResolved: e.target.checked })}
                      />
                    </label>
                    <label className="sla-policy-toggle sla-policy-field-block">
                      <span>ไม่นับ SLA เมื่อ conversation ถูก Archive</span>
                      <input
                        type="checkbox"
                        checked={form.excludeArchived}
                        disabled={!canEdit}
                        data-testid="sla-policy-exclude-archived"
                        onChange={(e) => patchForm({ excludeArchived: e.target.checked })}
                      />
                    </label>
                    <div className="sla-policy-deferred-options">
                      <div className="sla-policy-deferred-row">
                        <span>Business hours</span>
                        <span className="inbox-badge sla-policy-coming-soon">Coming soon</span>
                      </div>
                      <div className="sla-policy-deferred-row">
                        <span>Channel-specific SLA</span>
                        <span className="inbox-badge sla-policy-coming-soon">Coming soon</span>
                      </div>
                    </div>
                  </section>

                  {canEdit ? (
                    <div className="sla-policy-actions" data-testid="sla-policy-actions">
                      <button
                        type="button"
                        className="team-members-add-btn"
                        data-testid="sla-policy-save"
                        disabled={saveBusy || !validation.valid || !dirty}
                        onClick={() => void savePolicy()}
                      >
                        {saveBusy ? "Saving…" : "Save Policy"}
                      </button>
                      <button
                        type="button"
                        className="inbox-filter-btn"
                        data-testid="sla-policy-reset"
                        disabled={saveBusy || !dirty}
                        onClick={resetChanges}
                      >
                        Reset Changes
                      </button>
                      <button
                        type="button"
                        className="inbox-filter-btn"
                        data-testid="sla-policy-cancel-reload"
                        disabled={saveBusy || loadBusy}
                        onClick={() => void loadPolicy()}
                      >
                        Cancel / Reload
                      </button>
                    </div>
                  ) : null}
                </div>

                <aside className="sla-policy-preview card" data-testid="sla-policy-preview">
                  <h3>Live preview</h3>
                  <p className="hint">ตัวอย่างจากค่าในฟอร์ม — ไม่ใช่ข้อมูลจริงจาก API</p>
                  <ul className="sla-policy-preview-list">
                    {previewItems.map((item) => (
                      <li
                        key={item.id}
                        className={`sla-policy-preview-item sla-policy-preview-${item.tone}`}
                        data-testid={`sla-preview-${item.id}`}
                      >
                        <strong>{item.title}</strong>
                        <span className="hint">{item.subtitle}</span>
                      </li>
                    ))}
                  </ul>
                </aside>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
