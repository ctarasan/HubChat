import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TeamMemberPasswordVisibilityIcon } from "./teamMemberPasswordIcons.js";

void React;

test("eye icon renders when password is hidden", () => {
  const html = renderToStaticMarkup(createElement(TeamMemberPasswordVisibilityIcon, { visible: false }));
  assert.match(html, /<svg/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, /Show|Hide/);
  assert.match(html, /M1 12s4-8 11-8/);
});

test("eye-off icon renders when password is visible", () => {
  const html = renderToStaticMarkup(createElement(TeamMemberPasswordVisibilityIcon, { visible: true }));
  assert.match(html, /<svg/);
  assert.match(html, /M17\.94 17\.94/);
  assert.doesNotMatch(html, /Show|Hide/);
});

test("icon module does not export password values or log helpers", () => {
  const src = readFileSync(new URL("./teamMemberPasswordIcons.tsx", import.meta.url), "utf8");
  assert.equal(src.includes("console."), false);
  assert.equal(src.toLowerCase().includes("password value"), false);
});
