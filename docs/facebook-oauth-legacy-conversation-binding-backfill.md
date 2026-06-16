# Facebook OAuth legacy conversation binding — backfill runbook

## Context

Legacy Facebook conversations may have `channel_connection_id = NULL` while `provider_page_id` is set. After the outbound resolver hotfix, runtime can resolve credentials via page-scoped READY matching, but persisting `channel_connection_id` removes ambiguity and aligns inbox scope with outbound.

**Do not run writes in production without rehearsal on a staging snapshot and operator approval.**

## Phase 1 — Read-only inventory

```sql
-- Unbound Facebook conversations with provider page id
SELECT
  c.tenant_id,
  c.provider_page_id,
  COUNT(*) AS unbound_conversation_count
FROM conversations c
WHERE c.channel_type = 'FACEBOOK'
  AND c.channel_connection_id IS NULL
  AND c.provider_page_id IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2;
```

```sql
-- Candidate READY connections per tenant/page (read-only)
SELECT
  cc.tenant_id,
  cc.provider_page_id,
  COUNT(*) FILTER (WHERE cc.status = 'READY') AS ready_connection_count,
  array_agg(cc.id ORDER BY cc.created_at) FILTER (WHERE cc.status = 'READY') AS ready_connection_ids
FROM channel_connections cc
WHERE cc.provider = 'FACEBOOK'
GROUP BY 1, 2
ORDER BY 1, 2;
```

```sql
-- Rows eligible for automatic backfill preview (exactly one READY match, same tenant + page)
WITH unbound AS (
  SELECT c.id, c.tenant_id, c.provider_page_id
  FROM conversations c
  WHERE c.channel_type = 'FACEBOOK'
    AND c.channel_connection_id IS NULL
    AND c.provider_page_id IS NOT NULL
),
ready_matches AS (
  SELECT
    u.id AS conversation_id,
    u.tenant_id,
    u.provider_page_id,
    cc.id AS connection_id,
    COUNT(*) OVER (PARTITION BY u.id) AS match_count
  FROM unbound u
  JOIN channel_connections cc
    ON cc.tenant_id = u.tenant_id
   AND cc.provider = 'FACEBOOK'
   AND cc.status = 'READY'
   AND cc.provider_page_id = u.provider_page_id
)
SELECT tenant_id, provider_page_id, COUNT(*) AS backfill_eligible_count
FROM ready_matches
WHERE match_count = 1
GROUP BY 1, 2
ORDER BY 1, 2;
```

```sql
-- Ambiguous or blocked rows (zero or multiple READY matches) — manual review only
WITH unbound AS (
  SELECT c.id, c.tenant_id, c.provider_page_id
  FROM conversations c
  WHERE c.channel_type = 'FACEBOOK'
    AND c.channel_connection_id IS NULL
    AND c.provider_page_id IS NOT NULL
),
ready_matches AS (
  SELECT
    u.id AS conversation_id,
    u.tenant_id,
    u.provider_page_id,
    COUNT(cc.id) AS ready_match_count
  FROM unbound u
  LEFT JOIN channel_connections cc
    ON cc.tenant_id = u.tenant_id
   AND cc.provider = 'FACEBOOK'
   AND cc.status = 'READY'
   AND cc.provider_page_id = u.provider_page_id
  GROUP BY 1, 2, 3
)
SELECT *
FROM ready_matches
WHERE ready_match_count <> 1
ORDER BY tenant_id, provider_page_id;
```

## Phase 2 — Staging rehearsal

1. Restore production snapshot to isolated staging.
2. Run Phase 1 queries; archive counts.
3. Execute Phase 3 `BEGIN … ROLLBACK` block; verify eligible row count only.
4. Re-run outbound send on one previously failing conversation id.

## Phase 3 — Production update (operator-run)

```sql
BEGIN;

WITH unbound AS (
  SELECT c.id, c.tenant_id, c.provider_page_id
  FROM conversations c
  WHERE c.channel_type = 'FACEBOOK'
    AND c.channel_connection_id IS NULL
    AND c.provider_page_id IS NOT NULL
),
unique_ready AS (
  SELECT
    u.id AS conversation_id,
    MIN(cc.id::text)::uuid AS connection_id
  FROM unbound u
  JOIN channel_connections cc
    ON cc.tenant_id = u.tenant_id
   AND cc.provider = 'FACEBOOK'
   AND cc.status = 'READY'
   AND cc.provider_page_id = u.provider_page_id
  GROUP BY u.id
  HAVING COUNT(cc.id) = 1
)
UPDATE conversations c
SET channel_connection_id = u.connection_id,
    updated_at = NOW()
FROM unique_ready u
WHERE c.id = u.conversation_id
  AND c.channel_connection_id IS NULL;

-- Inspect row count, then COMMIT or ROLLBACK
ROLLBACK;
```

Replace `ROLLBACK` with `COMMIT` only after counts match rehearsal.

## Phase 4 — Post-check

```sql
SELECT COUNT(*) AS remaining_unbound
FROM conversations
WHERE channel_type = 'FACEBOOK'
  AND channel_connection_id IS NULL
  AND provider_page_id IS NOT NULL;
```

Retry one failed outbound job for conversation `207d5db8-73bf-477f-b6c3-9ef91bc2cab2` (or re-send from UI) after deploy + optional backfill.

## Safety rules

- Never match across tenants.
- Never match across different `provider_page_id` values.
- Never pick an arbitrary connection when multiple READY rows share the same page.
- No credential/token columns are read or written by this backfill.
