import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  createMessageTemplatesGetHandler,
  createMessageTemplatesPostHandler
} from "../../../app/api/message-templates/route.js";
import {
  createMessageTemplateDeleteHandler,
  createMessageTemplatePatchHandler
} from "../../../app/api/message-templates/[id]/route.js";
import type { MessageTemplateDto } from "../../../src/domain/messageTemplates.js";

type Auth = {
  tenantId: string;
  userId: string;
  email: string;
  role: "SALES" | "MANAGER" | "ADMIN";
  salesAgentId: string | null;
};

function auth(partial?: Partial<Auth>): Auth {
  return {
    tenantId: "tenant-a",
    userId: "user-a",
    email: "a@example.com",
    role: "ADMIN",
    salesAgentId: null,
    ...partial
  };
}

function makeRepo(seed: MessageTemplateDto[] = []) {
  const rows = seed.map((s) => ({
    ...s,
    tenantId: "tenant-a",
    ownerUserId: "user-a"
  }));
  return {
    rows,
    async listByOwner(input: { tenantId: string; ownerUserId: string }) {
      return rows
        .filter((r) => r.tenantId === input.tenantId && r.ownerUserId === input.ownerUserId)
        .map(({ id, title, body, createdAt, updatedAt }) => ({ id, title, body, createdAt, updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
    },
    async getByIdForOwner(input: { tenantId: string; ownerUserId: string; id: string }) {
      const row = rows.find(
        (r) => r.id === input.id && r.tenantId === input.tenantId && r.ownerUserId === input.ownerUserId
      );
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    },
    async create(input: { tenantId: string; ownerUserId: string; title: string; body: string }) {
      const now = "2026-07-20T00:00:00.000Z";
      const row = {
        id: `id-${rows.length + 1}`,
        tenantId: input.tenantId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        body: input.body,
        createdAt: now,
        updatedAt: now
      };
      rows.push(row);
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    },
    async update(input: {
      tenantId: string;
      ownerUserId: string;
      id: string;
      title: string;
      body: string;
    }) {
      const row = rows.find(
        (r) => r.id === input.id && r.tenantId === input.tenantId && r.ownerUserId === input.ownerUserId
      );
      if (!row) return null;
      row.title = input.title;
      row.body = input.body;
      row.updatedAt = "2026-07-20T01:00:00.000Z";
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    },
    async delete(input: { tenantId: string; ownerUserId: string; id: string }) {
      const idx = rows.findIndex(
        (r) => r.id === input.id && r.tenantId === input.tenantId && r.ownerUserId === input.ownerUserId
      );
      if (idx < 0) return false;
      rows.splice(idx, 1);
      return true;
    }
  };
}

function deps(repo: ReturnType<typeof makeRepo>, requireAuthImpl: (req: NextRequest) => Promise<Auth>) {
  return {
    requireAuth: async (req: NextRequest) => requireAuthImpl(req),
    apiBootstrap: () => ({ messageTemplateRepository: repo }) as any
  };
}

test("message templates API rejects unauthenticated list/create/update/delete", async () => {
  const repo = makeRepo();
  const unauth = async () => {
    throw new Error("Unauthorized");
  };
  const d = deps(repo, unauth);
  const get = await createMessageTemplatesGetHandler(d)(new NextRequest("http://local/api/message-templates"));
  assert.equal(get.status, 401);
  const post = await createMessageTemplatesPostHandler(d)(
    new NextRequest("http://local/api/message-templates", {
      method: "POST",
      body: JSON.stringify({ title: "t", body: "b" }),
      headers: { "Content-Type": "application/json" }
    })
  );
  assert.equal(post.status, 401);
  const patch = await createMessageTemplatePatchHandler(d)(
    new NextRequest("http://local/api/message-templates/x", {
      method: "PATCH",
      body: JSON.stringify({ title: "t", body: "b" }),
      headers: { "Content-Type": "application/json" }
    }),
    { params: Promise.resolve({ id: "x" }) }
  );
  assert.equal(patch.status, 401);
  const del = await createMessageTemplateDeleteHandler(d)(
    new NextRequest("http://local/api/message-templates/x", { method: "DELETE" }),
    { params: Promise.resolve({ id: "x" }) }
  );
  assert.equal(del.status, 401);
});

test("message templates create derives tenant/user and ignores client ownership fields", async () => {
  const repo = makeRepo();
  const d = deps(repo, async () => auth());
  const res = await createMessageTemplatesPostHandler(d)(
    new NextRequest("http://local/api/message-templates", {
      method: "POST",
      body: JSON.stringify({
        title: "ราคา Package S",
        body: "สวัสดี\nครับ",
        tenantId: "evil-tenant",
        ownerUserId: "evil-user",
        tenant_id: "evil-tenant",
        owner_user_id: "evil-user"
      }),
      headers: { "Content-Type": "application/json" }
    })
  );
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.data.title, "ราคา Package S");
  assert.equal(json.data.body, "สวัสดี\nครับ");
  assert.equal(json.data.tenantId, undefined);
  assert.equal(repo.rows[0]?.tenantId, "tenant-a");
  assert.equal(repo.rows[0]?.ownerUserId, "user-a");
});

test("message templates list returns only own templates and supports search", async () => {
  const repo = makeRepo();
  repo.rows.push(
    {
      id: "mine",
      tenantId: "tenant-a",
      ownerUserId: "user-a",
      title: "Mine",
      body: "hello",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T02:00:00.000Z"
    },
    {
      id: "other-user",
      tenantId: "tenant-a",
      ownerUserId: "user-b",
      title: "Other",
      body: "secret",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T03:00:00.000Z"
    },
    {
      id: "other-tenant",
      tenantId: "tenant-b",
      ownerUserId: "user-a",
      title: "Foreign",
      body: "nope",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T04:00:00.000Z"
    }
  );
  const d = deps(repo, async () => auth());
  const list = await createMessageTemplatesGetHandler(d)(new NextRequest("http://local/api/message-templates"));
  assert.equal(list.status, 200);
  const json = await list.json();
  assert.deepEqual(
    json.data.map((x: MessageTemplateDto) => x.id),
    ["mine"]
  );

  const search = await createMessageTemplatesGetHandler(d)(
    new NextRequest("http://local/api/message-templates?q=hello")
  );
  const searchJson = await search.json();
  assert.equal(searchJson.data.length, 1);
});

test("message templates update/delete own; foreign id returns not found", async () => {
  const repo = makeRepo([
    {
      id: "mine",
      title: "Old",
      body: "body",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z"
    }
  ]);
  repo.rows.push({
    id: "foreign",
    tenantId: "tenant-a",
    ownerUserId: "user-b",
    title: "Nope",
    body: "x",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z"
  });
  const d = deps(repo, async () => auth());

  const patchForeign = await createMessageTemplatePatchHandler(d)(
    new NextRequest("http://local/api/message-templates/foreign", {
      method: "PATCH",
      body: JSON.stringify({ title: "Hacked", body: "no" }),
      headers: { "Content-Type": "application/json" }
    }),
    { params: Promise.resolve({ id: "foreign" }) }
  );
  assert.equal(patchForeign.status, 404);

  const patchOwn = await createMessageTemplatePatchHandler(d)(
    new NextRequest("http://local/api/message-templates/mine", {
      method: "PATCH",
      body: JSON.stringify({ title: "New", body: "updated\ntext" }),
      headers: { "Content-Type": "application/json" }
    }),
    { params: Promise.resolve({ id: "mine" }) }
  );
  assert.equal(patchOwn.status, 200);
  const patched = await patchOwn.json();
  assert.equal(patched.data.title, "New");
  assert.equal(patched.data.body, "updated\ntext");

  const delForeign = await createMessageTemplateDeleteHandler(d)(
    new NextRequest("http://local/api/message-templates/foreign", { method: "DELETE" }),
    { params: Promise.resolve({ id: "foreign" }) }
  );
  assert.equal(delForeign.status, 404);

  const delOwn = await createMessageTemplateDeleteHandler(d)(
    new NextRequest("http://local/api/message-templates/mine", { method: "DELETE" }),
    { params: Promise.resolve({ id: "mine" }) }
  );
  assert.equal(delOwn.status, 200);
  assert.equal(repo.rows.some((r) => r.id === "mine"), false);
});

test("message templates reject blank validation", async () => {
  const repo = makeRepo();
  const d = deps(repo, async () => auth());
  const res = await createMessageTemplatesPostHandler(d)(
    new NextRequest("http://local/api/message-templates", {
      method: "POST",
      body: JSON.stringify({ title: "  ", body: "" }),
      headers: { "Content-Type": "application/json" }
    })
  );
  assert.equal(res.status, 400);
});
