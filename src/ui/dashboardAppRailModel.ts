import type { DashboardNavIconName } from "./dashboardNavIcons.js";
import type { DashboardNavRole } from "./dashboardNavAccess.js";
import {
  canViewAnalyticsNav,
  canViewSlaPolicyNav,
  canViewWorkQueueNav
} from "./dashboardNavAccess.js";

export type DashboardNavActiveId =
  | "inbox"
  | "team"
  | "ops"
  | "leads"
  | "sla"
  | "analytics"
  | "work-queue"
  | "channels";

export type DashboardNavItemDef = {
  id: DashboardNavActiveId | "settings";
  href?: string;
  label: string;
  title: string;
  testId: string;
  icon: DashboardNavIconName;
  visible: boolean;
  disabled?: boolean;
};

export function canViewTeamNav(role: DashboardNavRole | null | undefined): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function canViewOpsNav(role: DashboardNavRole | null | undefined): boolean {
  return role === "ADMIN";
}

export function canViewChannelsNav(role: DashboardNavRole | null | undefined): boolean {
  return role === "ADMIN";
}

export function buildDashboardNavItems(input: {
  role: DashboardNavRole | null | undefined;
  /** Inbox page shows disabled Channels/Settings placeholders for non-admin / coming soon. */
  showInboxPlaceholders?: boolean;
}): DashboardNavItemDef[] {
  const role = input.role;
  const showInboxPlaceholders = Boolean(input.showInboxPlaceholders);
  const items: DashboardNavItemDef[] = [
    {
      id: "inbox",
      href: "/dashboard",
      label: "Inbox",
      title: "Inbox",
      testId: "nav-team-inbox",
      icon: "inbox",
      visible: true
    },
    {
      id: "team",
      href: "/dashboard/team-members",
      label: "Team",
      title: "Team",
      testId: "nav-team-members",
      icon: "users",
      visible: canViewTeamNav(role)
    },
    {
      id: "ops",
      href: "/dashboard/ops",
      label: "Ops",
      title: "Ops Runtime",
      testId: "nav-ops-runtime",
      icon: "activity",
      visible: canViewOpsNav(role)
    },
    {
      id: "leads",
      href: "/dashboard/leads",
      label: "Leads",
      title: "Leads",
      testId: "nav-leads",
      icon: "target",
      visible: true
    },
    {
      id: "sla",
      href: "/dashboard/sla-policy",
      label: "SLA",
      title: "SLA Policy",
      testId: "nav-sla-policy",
      icon: "clock",
      visible: canViewSlaPolicyNav(role)
    },
    {
      id: "analytics",
      href: "/dashboard/analytics",
      label: "Analytics",
      title: "Analytics",
      testId: "nav-analytics",
      icon: "bar-chart",
      visible: canViewAnalyticsNav(role)
    },
    {
      id: "work-queue",
      href: "/dashboard/work-queue",
      label: "Queue",
      title: "Work Queue",
      testId: "nav-work-queue",
      icon: "list-checks",
      visible: canViewWorkQueueNav(role)
    }
  ];

  if (canViewChannelsNav(role)) {
    items.push({
      id: "channels",
      href: "/dashboard/channel-settings",
      label: "Channels",
      title: "Channel Settings",
      testId: "nav-channel-settings",
      icon: "radio",
      visible: true
    });
  } else if (showInboxPlaceholders) {
    items.push({
      id: "channels",
      label: "Channels",
      title: "Coming soon",
      testId: "nav-channel-settings-disabled",
      icon: "radio",
      visible: true,
      disabled: true
    });
  }

  if (showInboxPlaceholders) {
    items.push({
      id: "settings",
      label: "Settings",
      title: "Coming soon",
      testId: "nav-settings-disabled",
      icon: "settings",
      visible: true,
      disabled: true
    });
  }

  return items.filter((item) => item.visible);
}
