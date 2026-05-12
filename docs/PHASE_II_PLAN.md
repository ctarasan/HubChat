# SmartKorp HubChat Phase II Plan

## Phase II Goal

Phase II aims to evolve HubChat from a multi-channel chat viewer into a production-ready Team Inbox + Lead Management system.

The core goal is to support real sales team operation:

- inbound leads from LINE, Facebook, and Instagram
- Sales Manager lead assignment
- Sales Agent ownership
- lead status tracking
- conversation status tracking
- SLA and follow-up tracking
- permission guard
- audit trail
- reliability and observability
- foundation for multi-tenant and marketing automation integration

## Current System Context

Known status:

- LINE messaging works
- Facebook comment webhook works
- Facebook private reply / DM works
- Facebook public reply works
- Instagram DM text works
- outbound pipeline uses queue/outbox/worker/channel adapter pattern
- Railway worker is running normally after hotfix
- Dashboard refresh / queue stuck PROCESSING hotfix completed
- Instagram media is not yet full Phase II scope
- current priority is Lead Assignment and Team Inbox

## Phase II Milestones

### Phase II-A: System Foundation & Schema Cleanup

Purpose:

Prepare the data model for team-based lead management.

Scope:

- app user model alignment
- team model
- role model
- conversation assignment fields
- conversation status fields
- lead status fields
- SLA-related timestamps
- conversation event/audit log
- backward-compatible migration strategy

Expected database fields on conversations:

- organization_id
- team_id
- assigned_user_id
- assigned_by_user_id
- assigned_at
- assignment_status
- conversation_status
- lead_status
- priority
- first_response_at
- last_customer_message_at
- last_agent_message_at
- resolved_at
- closed_at
- sla_due_at

Recommended statuses:

assignment_status:

- UNASSIGNED
- ASSIGNED
- REASSIGNED
- UNASSIGNED_AGAIN

conversation_status:

- OPEN
- PENDING
- RESOLVED
- CLOSED

lead_status:

- NEW
- ASSIGNED
- CONTACTED
- INTERESTED
- QUALIFIED
- QUOTATION_SENT
- NEGOTIATING
- WON
- LOST
- NO_RESPONSE

priority:

- LOW
- NORMAL
- HIGH
- URGENT

Acceptance criteria:

- migrations are backward compatible
- old conversations still work
- existing inbound/outbound flow does not break
- existing dashboard can still load
- default existing conversations to UNASSIGNED / OPEN / NEW where appropriate

### Phase II-B: Lead Assignment / Team Inbox

Purpose:

Allow Sales Manager to assign leads/conversations to Sales Agents.

Core requirement:

Sales Manager must be able to assign, reassign, and unassign each lead/conversation to a Sales Agent responsible for handling that lead.

Main flow:

1. New inbound lead enters from LINE / Facebook / Instagram
2. Conversation is created or updated
3. New conversation starts as UNASSIGNED, OPEN, NEW
4. Sales Manager sees it in Unassigned queue
5. Sales Manager assigns it to a Sales Agent
6. Sales Agent sees it in Assigned to me queue
7. Sales Agent replies and manages lead status
8. Assignment changes are recorded in audit log

Roles:

- OWNER: full access
- ADMIN: full operational access
- SALES_MANAGER: view team leads, assign/reassign/unassign leads
- SALES_AGENT: view and reply to assigned leads
- VIEWER: read-only

Backend API concepts:

- PATCH /api/conversations/:conversationId/assignment
- PATCH /api/conversations/:conversationId/unassign
- GET /api/teams/:teamId/members?role=SALES_AGENT
- GET /api/conversations?scope=unassigned
- GET /api/conversations?scope=assigned_to_me
- GET /api/conversations?scope=my_team
- GET /api/conversations?assigned_user_id=...
- GET /api/conversations?lead_status=...
- GET /api/conversations?conversation_status=...

Backend permission guards:

- canViewConversation
- canReplyToConversation
- canAssignConversation
- canChangeLeadStatus
- canCloseConversation

Rules:

- Sales Manager/Admin can assign, reassign, and unassign
- Sales Agent can reply only to assigned conversations
- Unassigned conversations should not be replied to by Sales Agent until assigned
- Manager/Admin may reply but should be auditable
- assignment must not disappear when new inbound messages arrive
- reassignment must preserve message history

Audit events:

- LEAD_ASSIGNED
- LEAD_REASSIGNED
- LEAD_UNASSIGNED
- STATUS_CHANGED
- LEAD_STATUS_CHANGED
- PRIORITY_CHANGED
- CONVERSATION_RESOLVED
- CONVERSATION_REOPENED
- FIRST_RESPONSE_RECORDED

Acceptance criteria:

- Manager can see unassigned leads
- Manager can assign lead to Sales Agent
- Sales Agent can see assigned leads
- Sales Agent cannot reply to unassigned or other-agent leads
- Manager can reassign and unassign
- audit log is created for every assignment change
- inbound message on existing conversation keeps current assignment

### Phase II-C: Conversation Status / Lead Status / SLA / Follow-up

Purpose:

Track sales process and prevent lead leakage.

Scope:

- conversation status dropdown
- lead status dropdown
- priority dropdown
- first response tracking
- last customer message tracking
- last agent message tracking
- SLA due timestamp
- overdue calculation
- reopen when customer replies after resolved

Rules:

- inbound customer message updates last_customer_message_at
- first outbound agent reply sets first_response_at
- if lead is NEW or ASSIGNED, first agent reply can move lead_status to CONTACTED
- customer reply to RESOLVED conversation should reopen it
- status changes must create audit events

Acceptance criteria:

- user can change lead status
- user can change conversation status
- first response is captured
- overdue badge can be calculated
- customer reply can reopen resolved conversation
- status changes are logged

### Phase II-D: Dashboard UX for Sales Team

Purpose:

Make Dashboard usable as a real sales team inbox.

Scope:

Left sidebar filters:

- All
- Unassigned
- Assigned to me
- My team
- Overdue
- Resolved
- Closed

Secondary filters:

- Channel
- Assigned Sales
- Lead Status
- Conversation Status
- Priority
- Unread only

Conversation card should show:

- customer name
- channel icon
- last message
- last message time
- unread count
- assigned sales name
- lead status
- priority
- overdue badge
- conversation status

Chat header should show:

- customer display name
- channel
- assigned sales
- assign/reassign/unassign control
- lead status dropdown
- conversation status dropdown
- priority dropdown

Composer guard:

- disable composer if user cannot reply
- show friendly reason
- validate channel capability before creating outbound message

Manager view:

- unassigned lead count
- open lead count
- overdue lead count
- leads by sales
- won/lost summary
- average first response time

Acceptance criteria:

- Manager can assign from UI
- Sales Agent sees Assigned to me
- filters work
- composer is disabled when user cannot reply
- assignment and status persist after refresh

### Phase II-E: Channel Capability Matrix

Purpose:

Prevent invalid outbound messages before reaching provider APIs.

Channel/thread type capability model should distinguish:

- LINE_CHAT
- MESSENGER_DM
- FACEBOOK_COMMENT
- INSTAGRAM_DM

Capabilities to track:

- text
- image
- pdf
- public reply
- private reply
- max file size
- supported mime types
- requires public HTTPS URL

Known current capability baseline:

- LINE: text, image, pdf
- Facebook Messenger DM: text, image, pdf
- Facebook Comment: public text reply, private reply trigger
- Instagram DM: text currently; image planned in Phase II-H; pdf unsupported

Acceptance criteria:

- UI disables unsupported attachment/message types
- backend rejects unsupported outbound payloads
- friendly error is shown
- invalid outbound job is not created
- tests cover all supported channel/thread types

### Phase II-F: Reliability / Observability

Purpose:

Improve production debugging and resilience.

Scope:

- queue status monitoring
- worker heartbeat
- stuck PROCESSING recovery
- retry and dead-letter handling
- correlation ID from webhook to queue to message to outbound job
- admin ops read-only pages

Queue statuses:

- PENDING
- PROCESSING
- DONE
- FAILED
- RETRYING
- DEAD

Useful fields:

- locked_at
- locked_by
- attempt_count
- max_attempts
- next_retry_at
- last_error
- correlation_id

Acceptance criteria:

- stuck PROCESSING jobs can be recovered safely
- failed jobs show error
- worker heartbeat is visible
- retry does not duplicate messages
- logs include correlation ID

### Phase II-G: Channel Settings in Database

Purpose:

Move workspace/channel configuration toward database-backed settings to support multi-tenant operations.

Scope:

- channel_connections table
- organization_id
- provider account identifiers
- display name
- is_enabled
- settings jsonb
- encrypted secrets jsonb
- safe token resolution by backend only

Important:

- never expose secrets to frontend
- do not store tokens as plain text
- keep core infrastructure env vars in env:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - DATABASE_URL
  - ENCRYPTION_MASTER_KEY
  - NODE_ENV
  - PORT

Acceptance criteria:

- provider config can be resolved from DB
- existing channels still work
- channel can be enabled/disabled per workspace
- migration path from current env vars exists

### Phase II-H: Instagram Media Extension

Purpose:

Extend Instagram DM from text-only to media support.

Scope:

- inbound IG image
- dashboard image preview
- outbound IG image
- unsupported media friendly errors
- keep PDF unsupported unless provider support is confirmed

Acceptance criteria:

- IG inbound image appears in dashboard
- IG outbound image works
- unsupported media does not create outbound job
- Facebook adapter is not broken

### Phase II-I: Multi-tenant Foundation

Purpose:

Prepare HubChat for multiple customer organizations.

Scope:

- organizations
- organization_members
- workspaces
- teams
- team_members
- channel_connections
- organization_id on important tables
- backend data isolation guard
- future RLS readiness

Tables that should eventually include organization_id:

- conversations
- messages
- contacts
- contact_identities
- queue_jobs
- outbound_jobs
- channel_connections
- conversation_events

Acceptance criteria:

- users cannot access cross-organization data
- assignment cannot cross organization
- channel connection is organization scoped
- existing data can be migrated safely

### Phase II-J: Marketing Automation Bridge

Purpose:

Prepare HubChat events for SmartKorp Marketing Automation / Journey Engine.

Events:

- lead.created
- lead.assigned
- lead.contacted
- lead.status_changed
- conversation.message_inbound
- conversation.message_outbound
- conversation.reopened
- lead.won
- lead.lost
- lead.no_response

Recommended outbox table:

- marketing_events_outbox

Acceptance criteria:

- events are created reliably
- event payload includes organization_id, conversation_id, contact_id, channel, lead status, timestamps
- retry is supported
- duplicate events are avoided

## Recommended Implementation Order

1. Phase II-A: Schema foundation
2. Phase II-B: Backend assignment API and permission guard
3. Phase II-D: Dashboard assignment UX
4. Phase II-C: Lead status, conversation status, SLA
5. Phase II-E: Channel capability matrix
6. Phase II-F: Reliability / observability
7. Phase II-G: Channel settings in database
8. Phase II-H: Instagram media
9. Phase II-I: Multi-tenant foundation
10. Phase II-J: Marketing automation bridge

## Phase II MVP Scope

Must have:

- Sales Manager assign/reassign/unassign lead
- Sales Agent sees assigned leads
- Sales Agent cannot reply to leads owned by others
- unassigned queue
- assigned to me queue
- my team queue
- lead status
- conversation status
- audit log
- permission guard
- dashboard filters
- channel capability validation
- stuck queue recovery
- worker heartbeat

Should have:

- SLA overdue badge
- workload summary
- first response tracking
- ops queue dashboard
- channel settings in database

Could have:

- Instagram image inbound/outbound
- auto assignment
- marketing automation bridge
- advanced multi-tenant RLS

## Final Definition of Done

Phase II is considered done when:

- new lead enters Unassigned queue
- Sales Manager can assign it to Sales Agent
- Sales Agent can view and reply only to assigned leads
- Manager can view team leads
- assignment persists across inbound messages
- reassign and unassign work
- audit log records assignment/status changes
- status and lead status can be changed
- SLA fields are captured
- dashboard filters work
- invalid outbound message type is blocked by capability matrix
- queue/worker monitoring exists
- build/test pass
- deployment to Vercel and Railway remains stable
