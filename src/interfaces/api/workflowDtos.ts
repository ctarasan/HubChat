import type { WorkflowFollowUpItemDto } from "../../domain/workflow.js";

/** Keys that must never appear on workflow list items (messages, secrets, notes). */
export const WORKFLOW_LIST_FORBIDDEN_KEYS = [
  "external_user_id",
  "externalUserId",
  "provider_external_user_id",
  "providerExternalUserId",
  "content",
  "follow_up_note",
  "followUpNote",
  "last_message_preview",
  "lastMessagePreview",
  "metadata_json",
  "metadataJson",
  "media_url",
  "mediaUrl",
  "preview_url",
  "previewUrl",
  "payload_json",
  "payloadJson",
  "webhook",
  "token",
  "secret",
  "providerPayload",
  "rawWebhook"
] as const;

export function assertWorkflowListItemSafe(item: WorkflowFollowUpItemDto): void {
  const json = JSON.stringify(item);
  for (const key of WORKFLOW_LIST_FORBIDDEN_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`Workflow list item must not expose forbidden field: ${key}`);
    }
  }
}
