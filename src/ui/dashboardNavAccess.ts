export type DashboardNavRole = "SALES" | "MANAGER" | "ADMIN";

export function canViewSlaPolicyNav(role: DashboardNavRole | null | undefined): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function canAccessSlaPolicyPage(role: DashboardNavRole | null | undefined): boolean {
  return canViewSlaPolicyNav(role);
}

export function canEditSlaPolicy(role: DashboardNavRole | null | undefined): boolean {
  return role === "ADMIN";
}
