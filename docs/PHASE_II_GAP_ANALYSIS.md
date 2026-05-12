# SmartKorp HubChat Phase II Gap Analysis

## Purpose

This document records the current repo state and implementation decisions before starting Phase II-A System Foundation & Schema Cleanup.

## Current Repo Reality

### Tenant / Organization Boundary

- Current repo uses `tenants` and `tenant_id` as the main data boundary.
- Phase II plan mentions `organization_id` and `workspace_id`, but current implementation should treat `tenant_id` as the current organization boundary.
- Do not introduce `organization_id` in Phase II-A unless a separate migration plan is approved.

### User / Sales Agent Model

- Current repo uses `sales_agents` as the operational user model for sales team members.
- Current roles are `SALES`, `MANAGER`, `ADMIN`.
- Phase II role mapping:
  - `SALES_AGENT` maps to `SALES`
  - `SALES_MANAGER` maps to `MANAGER`
  - `ADMIN` maps to `ADMIN`
  - `OWNER` is deferred

### Lead and Conversation Assignment

Current repo has:

- `leads.assigned_sales_id`
- `conversations.assigned_agent_id`
- `POST /api/leads/:id/assign`
- `AssignLeadUseCase`
- `activity_logs`

Gap:

- Lead assignment and conversation assignment can diverge.
- Existing assign endpoint updates lead-level assignment but Team Inbox requires conversation-level ownership.
- Message sending currently does not enforce assigned ownership.

Decision:

- `conversations.assigned_agent_id` should be the source of truth for Team Inbox visibility and reply permission.
- `leads.assigned_sales_id` should remain as lead-level CRM ownership snapshot.
- Assignment changes should go through a single use case that updates both consistently when applicable.
- Permission checks for replying should use conversation-level assignment.

### Conversation Status

Current repo has conversation status enum:

- `OPEN`
- `PENDING`
- `CLOSED`

Phase II plan expects:

- `OPEN`
- `PENDING`
- `RESOLVED`
- `CLOSED`

Decision:

- Do not expand enum until implementation step is explicitly scoped.
- For Phase II-A foundation, document the gap and prepare migration strategy.
- `RESOLVED` can be added in a separate migration if required by Phase II-C.

### Lead Status

Current repo already has `lead_status` enum but values differ from the Phase II planning document.

Decision:

- Do not blindly replace current enum.
- Add missing values only through a controlled migration after mapping current values.
- Avoid breaking existing `LeadStatus` TypeScript types.

### Audit Trail

Current repo has:

- `activity_logs` for lead-level activity
- `message_events` for message-level events

Gap:

- No conversation-first audit table for assignment/status changes.

Decision:

- Phase II-A should introduce `conversation_events` for conversation-level audit trail.
- Existing `activity_logs` should not be removed.
- `conversation_events` should be used for Team Inbox actions such as assignment, reassignment, unassignment, status change, reopen, resolve.

### Permission Guard

Current repo has route-level `requireAuth` with role checks.

Gap:

- No fine-grained resource-level guard:
  - `canViewConversation`
  - `canReplyToConversation`
  - `canAssignConversation`
  - `canChangeLeadStatus`
  - `canCloseConversation`

Decision:

- Phase II-B should introduce resource-level authorization helpers.
- Message sending must eventually enforce `canReplyToConversation`.

### Queue / Reliability

Current repo already has:

- `queue_jobs`
- `outbox_events`
- `retry_count` / `attempt_count`
- `max_retries` / `max_attempts`
- `last_error`
- `PROCESSING` reclaim via `updated_at` timeout

Decision:

- Do not redesign queue schema in Phase II-A.
- Worker heartbeat and `correlation_id` belong to Phase II-F.
- Existing stuck `PROCESSING` recovery should be documented as current baseline.

## Recommended Phase II-A Implementation Strategy

Phase II-A should be implemented incrementally:

### A1. Add safe nullable conversation fields

Potential fields:

- `assignment_status`
- `priority`
- `first_response_at`
- `last_customer_message_at`
- `last_agent_message_at`
- `sla_due_at`
- `closed_at`

Do not add `organization_id` yet.

Use `tenant_id` as the current boundary.

### A2. Add `conversation_events` table

Recommended fields:

- `id`
- `tenant_id`
- `conversation_id`
- `lead_id` nullable
- `actor_sales_agent_id` nullable
- `actor_auth_user_id` nullable
- `event_type`
- `old_value` jsonb
- `new_value` jsonb
- `metadata_json` jsonb
- `note`
- `created_at`

### A3. Add indexes for Team Inbox queries

Potential indexes:

- `tenant_id` + `assigned_agent_id` + `last_message_at`
- `tenant_id` + `status` + `last_message_at`
- `tenant_id` + `lead_id`
- `tenant_id` + `assignment_status`
- `tenant_id` + `priority`
- `conversation_events` `tenant_id` + `conversation_id` + `created_at`

### A4. Keep backward compatibility

- Existing conversations must still load.
- Existing dashboard must still load.
- Existing worker must still work.
- Existing assign lead endpoint must not break.
- Existing inbound/outbound flow must not break.

## High Risk Areas

- Divergence between `leads.assigned_sales_id` and `conversations.assigned_agent_id`
- Message sending without assignment ownership check
- Enum changes that break TypeScript or database assumptions
- Adding organization/workspace model before tenant/team design is finalized
- Large queue schema changes before Team Inbox foundation is stable

## Recommended Next Implementation Step

After this document is committed, start Phase II-A1 with a small backward-compatible migration:

- add safe nullable fields to `conversations`
- add `conversation_events` table
- add indexes
- do not change runtime behavior yet
