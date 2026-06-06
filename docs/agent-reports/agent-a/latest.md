# Agent A — Latest Report

**CCP-3.7 — Extended monitoring / long-running flag-on decision (2026-06-06)**

Planning doc: [`2026-06-06-ccp-3-7-line-resolver-extended-monitoring-plan.md`](./2026-06-06-ccp-3-7-line-resolver-extended-monitoring-plan.md)

Prior: [CCP-3.6 execution](./2026-06-06-ccp-3-6-line-resolver-flag-on-execution-evidence.md) · [CCP-3.5 plan](./2026-06-06-ccp-3-5-line-resolver-flag-on-window-plan.md) · [CCP-3.4 P1–P7](./2026-06-05-ccp-3-4-production-p1-p7-line-preflight.md)

Status: Planning **complete** (docs-only). Current production flag **OFF / ABSENT**. Decision **READY TO SCHEDULE LIMITED EXTENDED MONITORING WINDOW** (Option C template: 1–2 h, Railway worker only, mandatory rollback). **Long-running flag-on NOT APPROVED.** **DB_ONLY NOT APPROVED.**

Blast radius: global Railway worker (LINE + Facebook + Instagram under `DB_WITH_ENV_FALLBACK`).

Next: Operator schedules separate **GO EXTENDED MONITORING** window when ready; until then keep flag **OFF / ABSENT**.
