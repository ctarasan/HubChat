# Post-mortem: <title>

> Copy this file to `docs/postmortems/YYYY-MM-DD-<short-slug>.md`.
> Delete this block and all guidance lines (blockquotes) before merge.
> Do not publish until all four readiness inputs are documented below.

## Metadata

| Field | Value |
|-------|--------|
| Date (incident or first prod report) | YYYY-MM-DD |
| Date fixed on production | YYYY-MM-DD |
| Severity | (e.g. SEV-2 — user-visible, core path broken) |
| Affected surface | (e.g. `/dashboard`, `GET /api/conversations`) |
| Fix PR | #NNN |
| Fix commit | `<full-or-short-sha>` |
| Fix branch | `branch-name` |
| Incident report | (link or `N/A — engineer-only`) |

---

## 1. Summary

One short paragraph: what users or operators saw, and the fix in one sentence.

---

## 2. Readiness inputs (required)

### 2.1 Reliable repro

- **Environment:** production | staging | local (match what you verified)
- **Steps:**
  1. …
  2. …
- **Expected vs actual:** …
- **Notes:** (intermittent? role-specific? only after deploy X?)

### 2.2 Root cause

- **Mechanism:** (e.g. hook order after conditional return, invalid PostgREST filter)
- **Primary files / symbols:**
  - `path/to/file.ts` — `symbolName`
- **Introduced by:** (PR #NNN or commit if known; otherwise `unknown`)
- **Evidence:** (error message, log snippet safe for repo — no secrets)

### 2.3 Fix pointer

- **PR:** #NNN — `<title>`
- **Commit:** `<sha>` on `master`
- **Diff focus:** (bullet list of files or behavior changed)

### 2.4 Validation result

| Check | Result |
|-------|--------|
| `git diff --check` | pass / fail |
| `npm run typecheck` | pass / fail |
| `npm run lint` | pass / fail |
| `npm test` | pass / fail (note count if recorded) |
| `npm run build` | pass / fail |
| Production / staging smoke | (describe; read-only unless approved) |

- **Regression tests added or updated:** (file and test name, or `none`)
- **Who validated / when:** (only if known — do not invent)

---

## 3. Timeline (engineering)

Optional. Use only verified timestamps. If unknown, write `unknown` — do not guess.

| Time (UTC or local + TZ) | Event |
|--------------------------|--------|
| | First production report / detection |
| | Fix merged |
| | Validated on production |

---

## 4. Impact

- **User impact:** (what broke for whom)
- **Data impact:** none | describe
- **Scope:** tenant-wide | route-specific | role-specific

---

## 5. What went well / what we learned

Blameless bullets. Facts and learnings only.

- …

---

## 6. Follow-ups (optional)

List only **agreed** items with owner if known. If none, write `None`.

| Action | Owner | Tracking |
|--------|-------|----------|
| | | issue / PR / `N/A` |

---

## 7. References

- Agent report: `docs/agent-reports/agent-a/...` or `agent-b/...`
- Related PRs: #NNN
- Tests: `path/to/file.test.ts` — `"test name"`
