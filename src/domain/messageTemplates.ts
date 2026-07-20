export const MESSAGE_TEMPLATE_TITLE_MAX = 120;
export const MESSAGE_TEMPLATE_BODY_MAX = 10_000;
export const MESSAGE_TEMPLATE_LIST_LIMIT = 100;
export const MESSAGE_TEMPLATE_SEARCH_MAX = 200;

export type MessageTemplateDto = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageTemplateRecord = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageTemplateWriteInput = {
  title: string;
  body: string;
};

export type MessageTemplateValidationError = {
  field: "title" | "body";
  message: string;
};

export function normalizeTemplateTitle(title: string): string {
  return String(title ?? "").trim();
}

/** Normalize newlines only; do not strip intentional trailing blank lines. */
export function normalizeTemplateBody(body: string): string {
  return String(body ?? "").replace(/\r\n/g, "\n");
}

export function validateMessageTemplateWrite(
  input: MessageTemplateWriteInput
): { ok: true; title: string; body: string } | { ok: false; errors: MessageTemplateValidationError[] } {
  const title = normalizeTemplateTitle(input.title);
  const body = normalizeTemplateBody(input.body);
  const errors: MessageTemplateValidationError[] = [];

  if (!title) {
    errors.push({ field: "title", message: "Template name is required." });
  } else if (title.length > MESSAGE_TEMPLATE_TITLE_MAX) {
    errors.push({
      field: "title",
      message: `Template name must be at most ${MESSAGE_TEMPLATE_TITLE_MAX} characters.`
    });
  }

  if (!body.trim()) {
    errors.push({ field: "body", message: "Message text is required." });
  } else if (body.length > MESSAGE_TEMPLATE_BODY_MAX) {
    errors.push({
      field: "body",
      message: `Message text must be at most ${MESSAGE_TEMPLATE_BODY_MAX} characters.`
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, title, body };
}

export function toMessageTemplateDto(row: MessageTemplateRecord): MessageTemplateDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function formatMessageTemplateValidationError(
  errors: MessageTemplateValidationError[]
): string {
  return errors.map((e) => e.message).join(" ");
}

export function filterMessageTemplatesClientSide(
  templates: MessageTemplateDto[],
  searchRaw: string
): MessageTemplateDto[] {
  const q = String(searchRaw ?? "").trim().slice(0, MESSAGE_TEMPLATE_SEARCH_MAX).toLowerCase();
  if (!q) return templates;
  return templates.filter(
    (t) => t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)
  );
}

export function previewMessageTemplateBody(body: string, maxLen = 80): string {
  const oneLine = normalizeTemplateBody(body).replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, Math.max(0, maxLen - 1))}…`;
}
