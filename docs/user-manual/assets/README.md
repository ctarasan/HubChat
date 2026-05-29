# User Manual Assets

Place **sanitized screenshots and diagrams** for the HubChat user manual in this folder.

## Before you commit any image

Remove or redact:

- Customer names, phone numbers, national IDs, or external user IDs
- Message content from real customers (inbound or outbound)
- Access tokens, webhook secrets, API keys, JWTs, or Bearer tokens
- Internal email addresses unless they are clearly demo placeholders
- Production URLs that expose tenant IDs, query tokens, or session data

## Recommended practice

- Use a demo tenant or staging environment when capturing UI.
- Replace names with generic labels such as "ลูกค้าตัวอย่าง A".
- Crop or blur sensitive areas in the conversation list and chat pane.
- Prefer annotated diagrams over full-screen production captures when possible.

## Naming

Use descriptive, lowercase filenames, for example:

- `dashboard-inbox-overview.png`
- `channel-settings-test-connection.png`
- `ops-runtime-health-warning.png`

Do not embed secrets in filenames or alt text.
