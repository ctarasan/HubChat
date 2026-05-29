# User Manual Exports

This folder is for **approved training or release exports** of the HubChat user manual (PDF, DOCX, or similar).

## When to add files here

- After a manual version is reviewed and approved for operator training
- When distributing a fixed snapshot for onboarding or compliance
- When a release tag documents a specific manual revision

## Rules

- Generate exports from the Markdown source in the parent folder (`hubchat-operator-user-manual-th.md`).
- Do **not** treat exports as the source of truth; update Markdown first, then regenerate exports.
- Do not commit exports that contain unsanitized screenshots or customer data.
- Prefer filenames that include version or date, for example `hubchat-operator-manual-th-2026-05-v1.pdf`.

## Git

Large binary exports are optional. If the team prefers external storage for heavy files, keep this folder’s README and link to the approved artifact instead.
