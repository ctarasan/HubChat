# Agent A — Latest Report

**FB-OAUTH-1G.1 — Isolated staging provisioning (2026-06-17)**

Evidence: [`2026-06-17-fb-oauth-1g1-isolated-staging-provisioning.md`](./2026-06-17-fb-oauth-1g1-isolated-staging-provisioning.md)

Architecture selected (Vercel custom `staging` + Railway `staging` worker + new Supabase project). Production inventory recorded unchanged at `cebb252`. **Verdict: BLOCKED** — staging not provisioned; owner approval required for Supabase/Railway/Vercel paid resources. Setup runbook: [`docs/hubchat-facebook-oauth-isolated-staging-setup.md`](../../hubchat-facebook-oauth-isolated-staging-setup.md). OAuth/resolver flags remain **off**. No OAuth flow or outbound sends.

Prior: FB-OAUTH-1G preflight ([#229](https://github.com/ctarasan/HubChat/pull/229)); FB-OAUTH-1H UI worksheet ([#230](https://github.com/ctarasan/HubChat/pull/230)); FB-OAUTH-1F runbook ([#227](https://github.com/ctarasan/HubChat/pull/227)).
