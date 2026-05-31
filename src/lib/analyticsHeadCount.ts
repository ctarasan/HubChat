export type AnalyticsCountFilter =
  | { column: string; op: "eq"; value: string }
  | { column: string; op: "gte"; value: string }
  | { column: string; op: "lt"; value: string }
  | { column: string; op: "lte"; value: string }
  | { column: string; op: "gt"; value: string }
  | { column: string; op: "in"; values: string[] }
  | { column: string; op: "is"; value: null }
  | { column: string; op: "not_is"; value: null };

export type AnalyticsHeadCountQuery = {
  eq(column: string, value: string): AnalyticsHeadCountQuery;
  gte(column: string, value: string): AnalyticsHeadCountQuery;
  lt(column: string, value: string): AnalyticsHeadCountQuery;
  lte(column: string, value: string): AnalyticsHeadCountQuery;
  gt(column: string, value: string): AnalyticsHeadCountQuery;
  in(column: string, values: string[]): AnalyticsHeadCountQuery;
  is(column: string, value: null): AnalyticsHeadCountQuery;
  not(column: string, operator: "is", value: null): AnalyticsHeadCountQuery;
};

export type AnalyticsHeadCountClient = {
  from(table: "conversations" | "leads" | "messages"): {
    select(columns: string, opts: { count: "exact"; head: true }): AnalyticsHeadCountQuery;
  };
};

export function normalizeAnalyticsCount(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function analyticsHeadCount(
  client: AnalyticsHeadCountClient,
  table: "conversations" | "leads" | "messages",
  filters: AnalyticsCountFilter[]
): Promise<number> {
  let query: AnalyticsHeadCountQuery = client.from(table).select("id", {
    count: "exact",
    head: true
  });
  for (const f of filters) {
    if (f.op === "eq") query = query.eq(f.column, f.value);
    else if (f.op === "gte") query = query.gte(f.column, f.value);
    else if (f.op === "lt") query = query.lt(f.column, f.value);
    else if (f.op === "lte") query = query.lte(f.column, f.value);
    else if (f.op === "gt") query = query.gt(f.column, f.value);
    else if (f.op === "in") query = query.in(f.column, f.values);
    else if (f.op === "is") query = query.is(f.column, f.value);
    else query = query.not(f.column, "is", f.value);
  }
  const result = await (query as unknown as Promise<{
    count: number | null;
    error: { message: string } | null;
  }>);
  if (result.error) throw result.error;
  return normalizeAnalyticsCount(result.count);
}

export type AnalyticsQueryCounter = {
  increment(): void;
  get(): number;
};

export function createAnalyticsQueryCounter(): AnalyticsQueryCounter {
  let n = 0;
  return {
    increment() {
      n += 1;
    },
    get() {
      return n;
    }
  };
}
