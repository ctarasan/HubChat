# SmartKorp HubChat Phase II Tasks

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked

## Phase II-A: System Foundation & Schema Cleanup

Checklist:

- [ ] Review current schema for users, teams, conversations, messages
- [ ] Identify existing auth/user model
- [ ] Design backward-compatible assignment fields
- [ ] Add conversation assignment fields
- [ ] Add conversation status and lead status fields
- [ ] Add SLA timestamp fields
- [ ] Add conversation_events audit table
- [ ] Add indexes for assigned_user_id, team_id, lead_status, conversation_status
- [ ] Add migration tests or manual verification notes
- [ ] Verify existing conversations still load

## Phase II-B: Lead Assignment / Team Inbox

Checklist:

- [ ] Define role permission matrix
- [ ] Implement canViewConversation
- [ ] Implement canReplyToConversation
- [ ] Implement canAssignConversation
- [ ] Implement assign conversation endpoint
- [ ] Implement unassign conversation endpoint
- [ ] Implement reassign behavior
- [ ] Implement team members endpoint for assignment dropdown
- [ ] Add conversation list filters for unassigned / assigned_to_me / my_team
- [ ] Add audit event on assign
- [ ] Add audit event on reassign
- [ ] Add audit event on unassign
- [ ] Prevent unauthorized Sales Agent reply
- [ ] Verify inbound message keeps assignment

## Phase II-C: Conversation Status / Lead Status / SLA

Checklist:

- [ ] Implement conversation status update endpoint
- [ ] Implement lead status update endpoint
- [ ] Implement priority update endpoint
- [ ] Add audit log for status changes
- [ ] Track last_customer_message_at on inbound
- [ ] Track last_agent_message_at on outbound
- [ ] Track first_response_at on first agent reply
- [ ] Reopen resolved conversation when customer replies
- [ ] Add SLA due calculation
- [ ] Add overdue query/filter

## Phase II-D: Dashboard UX for Sales Team

Checklist:

- [ ] Add primary filters: All / Unassigned / Assigned to me / My team / Overdue / Resolved / Closed
- [ ] Add secondary filters: Channel / Assigned Sales / Lead Status / Conversation Status / Priority / Unread only
- [ ] Show assigned sales on conversation card
- [ ] Show lead status on conversation card
- [ ] Show priority on conversation card
- [ ] Show overdue badge
- [ ] Add assignment control in chat header
- [ ] Add lead status dropdown
- [ ] Add conversation status dropdown
- [ ] Disable composer when user cannot reply
- [ ] Show friendly permission error
- [ ] Add manager summary view

## Phase II-E: Channel Capability Matrix

Checklist:

- [ ] Define capability model by provider_thread_type
- [ ] Add LINE_CHAT capabilities
- [ ] Add MESSENGER_DM capabilities
- [ ] Add FACEBOOK_COMMENT capabilities
- [ ] Add INSTAGRAM_DM capabilities
- [ ] Add backend outbound validation
- [ ] Add frontend composer guard
- [ ] Add friendly unsupported media errors
- [ ] Add tests for unsupported message types

## Phase II-F: Reliability / Observability

Checklist:

- [ ] Review current queue job schema
- [ ] Ensure locked_at / locked_by / attempts / last_error are available
- [ ] Add stuck PROCESSING recovery rule
- [ ] Add retry / dead-letter handling
- [ ] Add worker heartbeat table or mechanism
- [ ] Add correlation_id to queue/message/outbound flow
- [ ] Add admin ops read-only queue view
- [ ] Add admin ops worker heartbeat view
- [ ] Verify retry does not duplicate messages

## Phase II-G: Channel Settings in Database

Checklist:

- [ ] Design channel_connections table
- [ ] Add organization-scoped channel settings
- [ ] Add encrypted secret storage approach
- [ ] Implement backend channel config resolver
- [ ] Migrate LINE config resolution path
- [ ] Migrate Facebook config resolution path
- [ ] Migrate Instagram config resolution path
- [ ] Keep secrets hidden from frontend
- [ ] Add channel enabled/disabled flag

## Phase II-H: Instagram Media Extension

Checklist:

- [ ] Analyze Instagram webhook payload for image/media
- [ ] Normalize inbound IG image message
- [ ] Store IG media metadata
- [ ] Display IG image in dashboard
- [ ] Implement outbound IG image validation
- [ ] Implement outbound IG image send
- [ ] Add friendly error for unsupported PDF/media
- [ ] Add tests

## Phase II-I: Multi-tenant Foundation

Checklist:

- [ ] Review current organization/workspace assumptions
- [ ] Add organization model if missing
- [ ] Add organization_members if missing
- [ ] Add organization_id to important tables
- [ ] Add backend organization access guard
- [ ] Prevent cross-organization assignment
- [ ] Prepare RLS policy plan
- [ ] Verify existing data migration strategy

## Phase II-J: Marketing Automation Bridge

Checklist:

- [ ] Define HubChat event types
- [ ] Define event payload schema
- [ ] Add marketing_events_outbox design
- [ ] Emit lead.created
- [ ] Emit lead.assigned
- [ ] Emit lead.status_changed
- [ ] Emit conversation.message_inbound
- [ ] Emit conversation.message_outbound
- [ ] Add retry handling
- [ ] Prevent duplicate event delivery

## Current Recommended Next Step

Start with:

- Phase II-A
- Phase II-B

Do not start Instagram media, multi-tenant full isolation, or marketing automation until Lead Assignment foundation is stable.
