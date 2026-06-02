import { readFileSync } from "node:fs";

const dir = new URL(".", import.meta.url);

export const dashboardAppRailModelSource = readFileSync(
  new URL("./dashboardAppRailModel.ts", dir),
  "utf8"
);
export const dashboardAppRailUiSource = readFileSync(new URL("./DashboardAppRail.tsx", dir), "utf8");

/** Shared left-rail nav implementation (role gates, routes, test ids, SVG icons). */
export const dashboardNavBundleSource = dashboardAppRailModelSource + dashboardAppRailUiSource;
