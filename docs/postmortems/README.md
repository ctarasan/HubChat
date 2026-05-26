# Bug fix post-mortems

Engineer-to-engineer write-ups for **fixed and validated** production hotfixes and production-impacting bugs. Tone is **blameless** and factual: what broke, why, how we fixed it, and how we proved it.

This is **not** a customer-facing incident report. If stakeholders need timeline, blast radius, or communications, draft a separate **incident report** first, then link it from the post-mortem.

---

## When to write one

Write a post-mortem **only after**:

1. The bug is **fixed** on `master` (or the production branch you deploy from).
2. The fix is **validated** in the environment that mattered (production smoke, staging full repro, or equivalent evidence you can cite).
3. All **four readiness inputs** below are available and recorded — not guessed.

**Triggers (examples):**

- Production hotfix merged (e.g. dashboard crash, API 500 on a core route).
- Production-impacting bug fixed without a hotfix label but verified on the live deployment users hit.

**Do not write for:**

- Open bugs, speculative root cause, or fixes still in review.
- Purely local/dev issues with no production impact.
- Feature work or refactors with no production defect.

---

## Readiness gate (all four required)

Do **not** create or publish `docs/postmortems/<slug>.md` until every item is filled with **verified** facts.

| # | Input | What “ready” means |
|---|--------|-------------------|
| 1 | **Reliable repro** | Steps, route, role, filters, or request that consistently showed the failure (or documented why intermittent). |
| 2 | **Root cause** | Mechanism in code/config/schema — file paths, identifiers, error text — not symptoms alone. |
| 3 | **Fix pointer** | PR number, merge commit SHA, and/or branch name that landed the fix. |
| 4 | **Validation result** | Commands run, smoke steps, or production checks with pass/fail; test names if applicable. |

If any input is missing, stop at agent reports (`docs/agent-reports/`) until it is known.

**Do not invent:** root cause, validation outcomes, owners, dates of events you did not verify, or follow-up action items nobody agreed to.

---

## Workflow

1. Confirm the four readiness inputs (often from merged PR description, agent report, and verification logs).
2. Copy [`TEMPLATE.md`](TEMPLATE.md) to `docs/postmortems/YYYY-MM-DD-<short-slug>.md`.
3. Fill every section with **real** PR numbers, commit SHAs, paths, symbols, and test names from the repo.
4. Open a **docs-only** PR; default verification: `git diff --check`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
5. After merge, link the post-mortem from the fixing PR or agent report if useful for handoff.

---

## Naming and index

- **Filename:** `YYYY-MM-DD-<short-slug>.md` (kebab-case slug, e.g. `2026-05-25-dashboard-hook-order-crash`).
- **Index:** This README lists completed post-mortems (newest first). Add a row when a post-mortem merges.

| Date | Slug | PR | Summary |
|------|------|-----|---------|
| 2026-05-26 | [outbound-false-done-instagram-recovery](2026-05-26-outbound-false-done-instagram-recovery.md) | #81, #82, #83 | Outbound false-DONE, repository binding hotfixes, Instagram recovery |

---

## Incident report vs post-mortem

| | Incident report | Bug fix post-mortem |
|---|-----------------|---------------------|
| Audience | Customers, leadership, support | Engineers maintaining HubChat |
| Focus | Timeline, blast radius, comms, status | Repro, root cause, fix, validation, prevention ideas |
| Required first? | Yes, when external comms are needed | No — unless policy says link incident ID |

---

## Backfill policy

**Do not backfill** post-mortems for bugs already fixed on `master` before this protocol landed, including **PR #72** and **PR #73**. Use agent reports and PR history for those; add new post-mortems only for **future** validated fixes.

---

## Related docs

- [`TEMPLATE.md`](TEMPLATE.md) — blank post-mortem structure
- [`SKILL.md`](../../SKILL.md) — project skill (short protocol summary)
- [`docs/agent-reports/REPORT_TEMPLATE.md`](../agent-reports/REPORT_TEMPLATE.md) — task handoff (may hold readiness inputs before a post-mortem exists)
