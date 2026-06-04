# CCP-0 — Channel Connect Platform Index

Long-term **automatic Channel Setup Wizard** foundation (LINE OA, Facebook Page, Instagram).

## Primary document

**[CCP-0 Audit & Architecture Plan](./agent-reports/agent-a/2026-06-04-ccp-0-channel-connect-platform-audit-and-architecture.md)**

Contains:

- Current code audit (inbound/outbound/test-connection per provider)
- Runtime config source matrix
- ENV keep vs deprecate lists
- Target DB model (`channel_connections`, `channel_credentials`)
- Provider onboarding (LINE Module Channel, Meta OAuth)
- Rollout phases CCP-0 → CHW-1

## Scope boundaries (CCP-0)

- Docs only — no Setup Wizard, no `DB_ONLY` cutover, no production behavior change
- Marketplace paused
- No secrets in documentation

## Phase roadmap (summary)

| Phase | Focus |
|---|---|
| CCP-0 | Audit + architecture (this doc) |
| CCP-1 | DB connection/credential foundation |
| CCP-2 | DB runtime resolver (inbound + outbound) |
| LINE-M0 | LINE Module Channel attach |
| META-0 | SmartKorp Meta App + OAuth |
| CHW-1 | Setup Wizard UI |
| CCP-3 | ENV fallback removal |
