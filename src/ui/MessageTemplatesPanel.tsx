"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import {
  MESSAGE_TEMPLATE_BODY_MAX,
  MESSAGE_TEMPLATE_TITLE_MAX,
  filterMessageTemplatesClientSide,
  previewMessageTemplateBody,
  type MessageTemplateDto
} from "../domain/messageTemplates.js";
import {
  computeMessageTemplatesPanelCoords,
  messageTemplatesPanelCoordsEqual,
  type MessageTemplatesPanelCoords
} from "./messageTemplatesPanelModel.js";
import { MessageTemplateIcon } from "./messageTemplatesIcons.js";

type PanelMode = "list" | "create" | "edit" | "delete";

type Props = {
  disabled?: boolean;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onInsertBody: (body: string) => void;
};

async function readErrorMessage(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return typeof json.error === "string" && json.error.trim() ? json.error.trim() : "Request failed.";
}

function focusWithoutScroll(element: HTMLElement | null | undefined): void {
  if (!element) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function MessageTemplatesPanel({ disabled = false, apiFetch, onInsertBody }: Props) {
  const panelId = useId();
  const searchId = useId();
  const titleId = useId();
  const bodyId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const coordsRef = useRef<MessageTemplatesPanelCoords | null>(null);
  const focusModeRef = useRef<PanelMode | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MessageTemplatesPanelCoords | null>(null);
  const [mode, setMode] = useState<PanelMode>("list");
  const [templates, setTemplates] = useState<MessageTemplateDto[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [active, setActive] = useState<MessageTemplateDto | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const filtered = filterMessageTemplatesClientSide(templates, search);

  const applyCoords = useCallback((next: MessageTemplatesPanelCoords | null) => {
    coordsRef.current = next;
    setCoords((prev) => (messageTemplatesPanelCoordsEqual(prev, next) ? prev : next));
  }, []);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    applyCoords(
      computeMessageTemplatesPanelCoords({
        trigger: trigger.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      })
    );
  }, [applyCoords]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setMode("list");
    setFormError("");
    setActive(null);
    focusModeRef.current = null;
    applyCoords(null);
    window.setTimeout(() => focusWithoutScroll(triggerRef.current), 0);
  }, [applyCoords]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch("/api/message-templates");
      if (!res.ok) {
        setLoadError(await readErrorMessage(res));
        setTemplates([]);
        return;
      }
      const json = (await res.json()) as { data?: MessageTemplateDto[] };
      setTemplates(Array.isArray(json.data) ? json.data : []);
    } catch {
      setLoadError("Could not load templates.");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    setPortalTarget(typeof document !== "undefined" ? document.body : null);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      applyCoords(null);
      return;
    }
    reposition();
  }, [open, mode, reposition, applyCoords]);

  useEffect(() => {
    if (!open) return;
    void loadTemplates();
  }, [open, loadTemplates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (mode !== "list") {
          setMode("list");
          setFormError("");
          setActive(null);
          focusModeRef.current = "list";
          return;
        }
        closePanel();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const root = rootRef.current;
      const panel = panelRef.current;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (root?.contains(target) || panel?.contains(target)) return;
      closePanel();
    };
    const onViewportChange = () => reposition();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
    };
  }, [open, mode, closePanel, reposition]);

  useEffect(() => {
    if (!open) return;
    if (focusModeRef.current === mode) return;
    focusModeRef.current = mode;
    const t = window.setTimeout(() => {
      if (mode === "list") {
        focusWithoutScroll(searchRef.current);
        return;
      }
      if (mode === "create" || mode === "edit") {
        focusWithoutScroll(titleRef.current);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, mode]);

  function openCreate() {
    focusModeRef.current = null;
    setMode("create");
    setActive(null);
    setFormTitle("");
    setFormBody("");
    setFormError("");
  }

  function openEdit(item: MessageTemplateDto) {
    focusModeRef.current = null;
    setMode("edit");
    setActive(item);
    setFormTitle(item.title);
    setFormBody(item.body);
    setFormError("");
  }

  function openDelete(item: MessageTemplateDto) {
    focusModeRef.current = null;
    setMode("delete");
    setActive(item);
    setFormError("");
  }

  async function onSaveForm(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      const payload = { title: formTitle, body: formBody };
      const res =
        mode === "edit" && active
          ? await apiFetch(`/api/message-templates/${encodeURIComponent(active.id)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            })
          : await apiFetch("/api/message-templates", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
      if (!res.ok) {
        setFormError(await readErrorMessage(res));
        return;
      }
      setStatusMessage(mode === "edit" ? "Template updated." : "Template created.");
      focusModeRef.current = null;
      setMode("list");
      setActive(null);
      await loadTemplates();
    } catch {
      setFormError("Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  async function onConfirmDelete() {
    if (!active || saving) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await apiFetch(`/api/message-templates/${encodeURIComponent(active.id)}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        setFormError(await readErrorMessage(res));
        return;
      }
      setStatusMessage("Template deleted.");
      focusModeRef.current = null;
      setMode("list");
      setActive(null);
      await loadTemplates();
    } catch {
      setFormError("Could not delete template.");
    } finally {
      setSaving(false);
    }
  }

  function onSelectTemplate(item: MessageTemplateDto) {
    onInsertBody(item.body);
    closePanel();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!disabled) {
        setOpen((v) => !v);
      }
    }
  }

  const panelNode =
    open && coords ? (
      <div
        ref={panelRef}
        id={panelId}
        className="message-templates-panel"
        data-testid="message-templates-panel"
        role="dialog"
        aria-label="Message templates"
        style={{
          top: coords.top,
          left: coords.left,
          width: coords.width,
          maxHeight: coords.maxHeight
        }}
      >
        {mode === "list" ? (
          <div className="message-templates-panel-inner">
            <div className="message-templates-panel-head">
              <h3 className="message-templates-title">Message templates</h3>
              <button
                type="button"
                className="inbox-filter-btn"
                data-testid="message-templates-add"
                onClick={openCreate}
              >
                Add template
              </button>
            </div>
            <label className="message-templates-search-label" htmlFor={searchId}>
              Search templates
            </label>
            <input
              id={searchId}
              ref={searchRef}
              className="message-templates-search"
              data-testid="message-templates-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or text"
              disabled={loading}
            />
            {statusMessage ? (
              <p className="hint message-templates-status" role="status">
                {statusMessage}
              </p>
            ) : null}
            {loading ? (
              <p className="hint" data-testid="message-templates-loading">
                Loading…
              </p>
            ) : loadError ? (
              <div className="message-templates-error" data-testid="message-templates-error">
                <p className="hint">Could not load templates.</p>
                <button type="button" className="inbox-filter-btn" onClick={() => void loadTemplates()}>
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="hint" data-testid="message-templates-empty">
                {search.trim()
                  ? "No templates match your search."
                  : "No message templates yet. Create a template for messages you send often."}
              </p>
            ) : (
              <ul className="message-templates-list" data-testid="message-templates-list">
                {filtered.map((item) => (
                  <li key={item.id} className="message-templates-item">
                    <div className="message-templates-item-head">
                      <button
                        type="button"
                        className="message-templates-item-title-btn"
                        data-testid={`message-template-select-title-${item.id}`}
                        onClick={() => onSelectTemplate(item)}
                      >
                        <span className="message-templates-item-title">{item.title}</span>
                      </button>
                      <div className="message-templates-item-actions">
                        <button
                          type="button"
                          className="message-templates-item-action-btn"
                          data-testid={`message-template-edit-${item.id}`}
                          aria-label={`Edit template ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(item);
                          }}
                        >
                          <MessageTemplateIcon name="pencil" />
                        </button>
                        <button
                          type="button"
                          className="message-templates-item-action-btn message-templates-item-action-btn-danger"
                          data-testid={`message-template-delete-${item.id}`}
                          aria-label={`Delete template ${item.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDelete(item);
                          }}
                        >
                          <MessageTemplateIcon name="trash" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="message-templates-item-preview-btn"
                      data-testid={`message-template-select-${item.id}`}
                      aria-label={`Insert template ${item.title}`}
                      onClick={() => onSelectTemplate(item)}
                    >
                      <span className="message-templates-item-preview">
                        {previewMessageTemplateBody(item.body)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {mode === "create" || mode === "edit" ? (
          <form className="message-templates-form" data-testid="message-templates-form" onSubmit={onSaveForm}>
            <h3 className="message-templates-title">{mode === "edit" ? "Edit template" : "Add template"}</h3>
            <label htmlFor={titleId}>Template name</label>
            <input
              id={titleId}
              ref={titleRef}
              className="message-templates-input"
              data-testid="message-template-title-input"
              value={formTitle}
              maxLength={MESSAGE_TEMPLATE_TITLE_MAX}
              onChange={(e) => setFormTitle(e.target.value)}
              disabled={saving}
              required
            />
            <label htmlFor={bodyId}>Message text</label>
            <textarea
              id={bodyId}
              ref={bodyRef}
              className="message-templates-textarea"
              data-testid="message-template-body-input"
              value={formBody}
              maxLength={MESSAGE_TEMPLATE_BODY_MAX}
              rows={8}
              onChange={(e) => setFormBody(e.target.value)}
              disabled={saving}
              required
            />
            {formError ? (
              <p className="hint message-templates-form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="message-templates-form-actions">
              <button
                type="button"
                className="inbox-filter-btn"
                data-testid="message-template-form-cancel"
                onClick={() => {
                  focusModeRef.current = null;
                  setMode("list");
                  setFormError("");
                  setActive(null);
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="composer-send-btn"
                data-testid="message-template-form-save"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : null}

        {mode === "delete" && active ? (
          <div className="message-templates-delete" data-testid="message-templates-delete-confirm">
            <h3 className="message-templates-title">Delete template?</h3>
            <p className="hint">
              Delete <strong>{active.title}</strong>? This cannot be undone.
            </p>
            {formError ? (
              <p className="hint message-templates-form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="message-templates-form-actions">
              <button
                type="button"
                className="inbox-filter-btn"
                data-testid="message-template-delete-cancel"
                onClick={() => {
                  focusModeRef.current = null;
                  setMode("list");
                  setActive(null);
                  setFormError("");
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="composer-send-btn message-templates-delete-btn"
                data-testid="message-template-delete-confirm"
                onClick={() => void onConfirmDelete()}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="message-templates-root" ref={rootRef}>
      <button
        type="button"
        className="composer-attach-btn"
        data-testid="message-templates-trigger"
        ref={triggerRef}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        Templates
      </button>

      {portalTarget && panelNode ? createPortal(panelNode, portalTarget) : null}
    </div>
  );
}
