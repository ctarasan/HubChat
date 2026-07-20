import { normalizeTemplateBody } from "../domain/messageTemplates.js";

export type InsertTemplateIntoComposerInput = {
  existingText: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  templateBody: string;
  hasReliableSelection: boolean;
};

export type InsertTemplateIntoComposerResult = {
  nextText: string;
  nextCursor: number;
};

function clampIndex(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), max));
}

/**
 * Insert a template body into composer text.
 * Never sends. Preserves unrelated text and exact template line breaks.
 */
export function insertTemplateIntoComposer(
  input: InsertTemplateIntoComposerInput
): InsertTemplateIntoComposerResult {
  const existing = String(input.existingText ?? "");
  const body = normalizeTemplateBody(input.templateBody);

  if (input.hasReliableSelection) {
    const start = clampIndex(Number(input.selectionStart ?? 0), existing.length);
    const end = clampIndex(Number(input.selectionEnd ?? start), existing.length);
    const from = Math.min(start, end);
    const to = Math.max(start, end);
    const nextText = `${existing.slice(0, from)}${body}${existing.slice(to)}`;
    return { nextText, nextCursor: from + body.length };
  }

  if (!existing.trim()) {
    return { nextText: body, nextCursor: body.length };
  }

  const needsBlankLine = !existing.endsWith("\n\n");
  const separator = existing.endsWith("\n") ? (existing.endsWith("\n\n") ? "" : "\n") : "\n\n";
  const nextText = `${existing}${needsBlankLine ? separator : ""}${body}`;
  return { nextText, nextCursor: nextText.length };
}
