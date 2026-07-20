export const MESSAGE_TEMPLATES_PANEL_WIDTH = 340;
export const MESSAGE_TEMPLATES_PANEL_MAX_HEIGHT = 420;

export type MessageTemplatesPanelCoords = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

export const MESSAGE_TEMPLATES_COORD_EPSILON = 1;

export function messageTemplatesPanelCoordsEqual(
  a: MessageTemplatesPanelCoords | null | undefined,
  b: MessageTemplatesPanelCoords | null | undefined,
  epsilon = MESSAGE_TEMPLATES_COORD_EPSILON
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.top - b.top) <= epsilon &&
    Math.abs(a.left - b.left) <= epsilon &&
    Math.abs(a.width - b.width) <= epsilon &&
    Math.abs(a.maxHeight - b.maxHeight) <= epsilon
  );
}

/** Prefer opening above the trigger (composer is near bottom); flip below if needed. */
export function computeMessageTemplatesPanelCoords(input: {
  trigger: DOMRect;
  viewportWidth: number;
  viewportHeight: number;
  panelWidth?: number;
  preferredHeight?: number;
  gap?: number;
  margin?: number;
}): MessageTemplatesPanelCoords {
  const width = input.panelWidth ?? MESSAGE_TEMPLATES_PANEL_WIDTH;
  const preferredHeight = input.preferredHeight ?? MESSAGE_TEMPLATES_PANEL_MAX_HEIGHT;
  const gap = input.gap ?? 8;
  const margin = input.margin ?? 8;
  const vw = input.viewportWidth;
  const vh = input.viewportHeight;
  const trigger = input.trigger;

  let left = trigger.right - width;
  left = Math.max(margin, Math.min(left, vw - width - margin));

  const spaceAbove = trigger.top - margin - gap;
  const spaceBelow = vh - trigger.bottom - margin - gap;
  const openAbove = spaceAbove >= Math.min(preferredHeight, 220) || spaceAbove >= spaceBelow;
  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(160, Math.min(preferredHeight, available));

  let top: number;
  if (openAbove) {
    top = Math.max(margin, trigger.top - gap - maxHeight);
  } else {
    top = Math.min(vh - margin - maxHeight, trigger.bottom + gap);
  }

  return { top, left, width, maxHeight };
}
