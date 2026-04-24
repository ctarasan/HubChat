export function buildLastMessagePreview(input: {
  messageType?: string | null;
  content?: string | null;
  fileName?: string | null;
}): { preview: string; type: string } {
  const type = String(input.messageType ?? "TEXT").toUpperCase();
  if (type === "IMAGE") return { preview: "[Image]", type: "IMAGE" };
  if (type === "DOCUMENT_PDF") {
    const fileName = typeof input.fileName === "string" && input.fileName.trim() ? input.fileName.trim() : "document.pdf";
    return { preview: `[PDF] ${fileName}`, type: "DOCUMENT_PDF" };
  }
  const text = typeof input.content === "string" ? input.content.trim() : "";
  return {
    preview: text ? text.slice(0, 120) : "[Empty]",
    type: "TEXT"
  };
}
