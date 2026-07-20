import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(here, "MessageTemplatesPanel.tsx"), "utf8");
const iconsSource = readFileSync(join(here, "messageTemplatesIcons.tsx"), "utf8");
const cssSource = readFileSync(join(here, "../../app/globals.css"), "utf8");

test("template list items render compact trailing icon action buttons", () => {
  assert.match(panelSource, /MessageTemplateIcon/);
  assert.match(panelSource, /message-templates-item-head/);
  assert.match(panelSource, /message-templates-item-action-btn/);
  assert.match(panelSource, /name="pencil"/);
  assert.match(panelSource, /name="trash"/);
  assert.match(iconsSource, /export function MessageTemplateIcon/);
});

test("full-width Edit and Delete text buttons are not rendered in list items", () => {
  const listBlock = panelSource.slice(
    panelSource.indexOf('className="message-templates-list"'),
    panelSource.indexOf("mode === \"create\"")
  );
  assert.doesNotMatch(listBlock, />\s*Edit\s*</);
  assert.doesNotMatch(listBlock, />\s*Delete\s*</);
  assert.doesNotMatch(listBlock, /inbox-filter-btn/);
});

test("edit icon opens edit mode without calling template insertion", () => {
  assert.match(panelSource, /openEdit\(item\)/);
  assert.match(panelSource, /event\.stopPropagation\(\)/);
  const editHandler = panelSource.slice(
    panelSource.indexOf("message-template-edit-"),
    panelSource.indexOf("message-template-delete-")
  );
  assert.match(editHandler, /openEdit\(item\)/);
  assert.doesNotMatch(editHandler, /onSelectTemplate/);
});

test("delete icon opens delete confirmation without calling template insertion", () => {
  const deleteHandler = panelSource.slice(
    panelSource.indexOf("message-template-delete-${item.id}"),
    panelSource.indexOf("message-template-select-${item.id}")
  );
  assert.match(deleteHandler, /openDelete\(item\)/);
  assert.match(deleteHandler, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(deleteHandler, /onSelectTemplate/);
});

test("title and preview clicks still insert template into composer", () => {
  assert.match(panelSource, /message-templates-item-title-btn/);
  assert.match(panelSource, /message-templates-item-preview-btn/);
  assert.match(panelSource, /onClick=\{\(\) => onSelectTemplate\(item\)\}/);
  assert.match(panelSource, /data-testid=\{`message-template-select-\$\{item\.id\}`\}/);
  assert.match(panelSource, /data-testid=\{`message-template-select-title-\$\{item\.id\}`\}/);
});

test("icon buttons expose accessible names and remain native keyboard buttons", () => {
  assert.match(panelSource, /aria-label=\{`Edit template \$\{item\.title\}`\}/);
  assert.match(panelSource, /aria-label=\{`Delete template \$\{item\.title\}`\}/);
  assert.match(panelSource, /aria-label=\{`Insert template \$\{item\.title\}`\}/);
  assert.match(panelSource, /type="button"/);
  assert.match(iconsSource, /"aria-hidden":\s*true/);
});

test("compact item action CSS keeps icons on title row with theme-safe focus states", () => {
  assert.match(cssSource, /\.message-templates-item-head\s*\{/);
  assert.match(cssSource, /\.message-templates-item-action-btn\s*\{[^}]*width:\s*32px/s);
  assert.match(cssSource, /\.message-templates-item-action-btn:focus-visible/);
  assert.match(cssSource, /\.message-templates-item-title\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.match(cssSource, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(cssSource, /\.message-templates-item-main/);
});

test("delete confirmation flow remains unchanged", () => {
  assert.match(panelSource, /mode === "delete"/);
  assert.match(panelSource, /message-templates-delete-confirm/);
  assert.match(panelSource, /Delete template\?/);
  assert.match(panelSource, /onConfirmDelete/);
});
