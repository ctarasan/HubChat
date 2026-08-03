# META-FB-PROFILE-4 — Next Gate Recommendation

## Task 9 selection

**B. BAUPA rejection reason unclear → need more Meta evidence**

Also maps to deliverable final verdict:

**`BLOCKED — REJECTION DETAILS UNAVAILABLE`**

## Why not A / C / D / E-primary

| Option | Why not chosen as primary |
|---|---|
| A clear reason → prepare package | Exact reviewer feedback text is UNKNOWN |
| C product/evidence gap first | Product flow for Inbox avatar exists; primary blocker is unknown rejection rationale + Graph denial |
| D policy/eligibility decision | No evidence yet that BAUPA is ineligible for HubChat’s allowed usage |
| E dashboard cannot expose details | Partially true (login wall for agent), but operator already attested status=REJECTED; missing piece is **feedback text**, not status |

## Recommended next gate

**META-FB-PROFILE-4A — Operator Dashboard Rejection Capture (READ-ONLY)**

Operator (authenticated) only:

1. Open App `943662608544465` → App Review → Permissions and Features → Business Asset User Profile Access  
2. Open rejection / See details / Reviewer notes  
3. Export sanitized screenshots + paste feedback text into evidence folder  
4. Record submission date, requested access level, attachments listed  
5. **Do not** Request / Resubmit / Save  

Then:

- If feedback cites screencast / unclear use case / not visible in app → run evidence prep gate (storyboard in `resubmission-evidence-plan.md`)  
- If feedback cites business verification / contracts / policy eligibility → business decision gate  
- Only after feedback is known: explicit GO for resubmission package assembly  
- Still **no** Request/Submit until separate GO

## Code / Production

- No code PR before BAUPA access  
- Optional later: sanitized Graph error logging  
- No Production mutations in 4A
