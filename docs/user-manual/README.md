# HubChat User Manual (Documentation)

This folder stores the **official SmartKorp HubChat operator user manual** for production use.

## Source of truth

- **Markdown** in this directory is the canonical, version-controlled manual.
- Edit `hubchat-operator-user-manual-th.md` first when the product changes.
- Keep manual content aligned with **current production behavior** only.

## Optional exports

- PDF or Word (`.docx`) exports are **optional release artifacts** for training or printed handouts.
- Place approved export files under [`exports/`](./exports/README.md).
- Exports are snapshots; always check the Markdown source for the latest wording.

## Screenshots and assets

- Place sanitized screenshots under [`assets/`](./assets/README.md).
- **Sanitize every screenshot before commit.** Do not include real customer data or secrets.

## Do not commit

Never commit the following into this repository:

- Customer names, phone numbers, IDs, or real conversation content
- Access tokens, API secrets, JWTs, Bearer tokens, or webhook secrets
- Production logs, stack traces with credentials, or raw provider payloads
- Internal emails or credentials unless strictly necessary and redacted

If you need to illustrate UI flows, use demo accounts, placeholder text, or blurred/redacted fields.

## Related operator runbooks

- SLA Policy (ตั้งค่าและแก้ปัญหา): [`../hubchat-sla-operator-runbook.md`](../hubchat-sla-operator-runbook.md)

## Files

| File | Purpose |
|------|---------|
| `hubchat-operator-user-manual-th.md` | Thai operator manual (primary document) |
| `assets/` | Sanitized screenshots and diagrams |
| `exports/` | Approved PDF/DOCX training or release exports |
