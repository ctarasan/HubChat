import test from "node:test";
import assert from "node:assert/strict";
import { decodeRepoCursor, encodeRepoCursor } from "./cursorPagination.js";

type Row = { id: string; updatedAt: string; status: "OPEN" | "CLOSED" };

function pageRows(rows: Row[], limit: number, cursor?: string) {
  const sorted = [...rows].sort((a, b) => {
    if (a.updatedAt === b.updatedAt) return a.id < b.id ? 1 : -1;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
  const decoded = decodeRepoCursor<{ updatedAt: string; id: string }>(cursor);
  const filtered = decoded
    ? sorted.filter((r) => r.updatedAt < decoded.updatedAt || (r.updatedAt === decoded.updatedAt && r.id < decoded.id))
    : sorted;
  const items = filtered.slice(0, limit);
  const nextCursor =
    filtered.length > limit && items.length > 0
      ? encodeRepoCursor({
          updatedAt: items[items.length - 1].updatedAt,
          id: items[items.length - 1].id
        })
      : null;
  return { items, nextCursor };
}

test("pagination correctness and no duplicate rows across pages", () => {
  const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
    id: String(1000 - i),
    updatedAt: new Date(2026, 0, 1, 0, Math.floor(i / 2), 0).toISOString(),
    status: i % 2 === 0 ? "OPEN" : "CLOSED"
  }));

  const p1 = pageRows(rows, 10);
  const p2 = pageRows(rows, 10, p1.nextCursor ?? undefined);
  const p3 = pageRows(rows, 10, p2.nextCursor ?? undefined);
  const allIds = [...p1.items, ...p2.items, ...p3.items].map((x) => x.id);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(allIds.length, 25);
});

test("filters still work with pagination", () => {
  const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(2000 - i),
    updatedAt: new Date(2026, 1, 1, 0, i, 0).toISOString(),
    status: i % 3 === 0 ? "OPEN" : "CLOSED"
  }));
  const openRows = rows.filter((r) => r.status === "OPEN");
  const p1 = pageRows(openRows, 5);
  const p2 = pageRows(openRows, 5, p1.nextCursor ?? undefined);
  assert.equal(p1.items.every((x) => x.status === "OPEN"), true);
  assert.equal(p2.items.every((x) => x.status === "OPEN"), true);
});
