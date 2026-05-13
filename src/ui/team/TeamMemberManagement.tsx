"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
  X,
  Users,
  MessageSquare,
  Clock,
  CheckCircle2,
  Star,
  Activity,
  Mail,
  Phone,
  Calendar,
  MoreVertical,
  Edit2,
  UserX,
  UserCheck,
  Zap,
  LayoutGrid,
  List,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import {
  type TeamMember,
  type TeamMemberRole,
  type TeamMemberStatus,
  type TeamMemberAvailability,
  mockTeamMembers,
  getInitials,
  formatDate,
  getRoleColor,
  getWorkloadColor,
  getWorkloadBarColor,
} from "./types.js";

// Sidebar Component
function Sidebar({
  collapsed,
  onToggle,
  activeItem,
  onItemClick,
}: {
  collapsed: boolean;
  onToggle: () => void;
  activeItem: string;
  onItemClick: (item: string) => void;
}) {
  const navItems = [
    { id: "inbox", icon: MessageSquare, label: "Team Inbox" },
    { id: "team", icon: Users, label: "Team Members" },
    { id: "leads", icon: Zap, label: "Leads" },
    { id: "analytics", icon: Activity, label: "Analytics" },
  ];

  return (
    <aside
      className={clsx(
        "hidden md:flex flex-col bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <span className="font-semibold text-foreground text-sm">HubChat</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md hover:bg-secondary transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight
            className={clsx(
              "w-4 h-4 text-muted-foreground transition-transform",
              !collapsed && "rotate-180"
            )}
          />
        </button>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// Mobile Bottom Navigation
function MobileNav({
  activeItem,
  onItemClick,
}: {
  activeItem: string;
  onItemClick: (item: string) => void;
}) {
  const navItems = [
    { id: "inbox", icon: MessageSquare, label: "Inbox" },
    { id: "team", icon: Users, label: "Team" },
    { id: "leads", icon: Zap, label: "Leads" },
    { id: "analytics", icon: Activity, label: "Stats" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-card border-t border-border z-50">
      <div className="flex justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item.id)}
              className={clsx(
                "flex flex-col items-center py-2 px-4 flex-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Filter Dropdown Component
function FilterDropdown({
  label,
  value,
  options,
  onChange,
  isOpen,
  onToggle,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const selectedLabel = options.find((o) => o.value === value)?.label || label;

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors",
          value !== "all"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-foreground hover:bg-secondary"
        )}
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute top-full left-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-lg z-50 py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  onToggle();
                }}
                className={clsx(
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  option.value === value
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Mobile Filter Sheet
function MobileFilterSheet({
  isOpen,
  onClose,
  roleFilter,
  statusFilter,
  availabilityFilter,
  onRoleChange,
  onStatusChange,
  onAvailabilityChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  roleFilter: string;
  statusFilter: string;
  availabilityFilter: string;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onAvailabilityChange: (value: string) => void;
}) {
  if (!isOpen) return null;

  const roleOptions = [
    { value: "all", label: "All Roles" },
    { value: "Admin", label: "Admin" },
    { value: "Sale Manager", label: "Sale Manager" },
    { value: "Sale", label: "Sale" },
  ];

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  const availabilityOptions = [
    { value: "all", label: "All Availability" },
    { value: "available", label: "Available" },
    { value: "busy", label: "Busy" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl z-50 p-4 pb-8 animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Filters</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Role</label>
            <div className="flex flex-wrap gap-2">
              {roleOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onRoleChange(option.value)}
                  className={clsx(
                    "px-3 py-2 text-sm rounded-lg border transition-colors",
                    roleFilter === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Status</label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onStatusChange(option.value)}
                  className={clsx(
                    "px-3 py-2 text-sm rounded-lg border transition-colors",
                    statusFilter === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Availability</label>
            <div className="flex flex-wrap gap-2">
              {availabilityOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onAvailabilityChange(option.value)}
                  className={clsx(
                    "px-3 py-2 text-sm rounded-lg border transition-colors",
                    availabilityFilter === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          Apply Filters
        </button>
      </div>
    </>
  );
}

// Team Member Card (Mobile)
function TeamMemberCard({
  member,
  onSelect,
  isSelected,
}: {
  member: TeamMember;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={clsx(
        "bg-card border rounded-lg p-4 transition-all",
        isSelected ? "border-primary ring-1 ring-primary" : "border-border"
      )}
    >
      <button
        onClick={onSelect}
        className="w-full text-left"
      >
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
              {getInitials(member.name)}
            </div>
            <span
              className={clsx(
                "absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-card",
                member.status === "active"
                  ? member.availability === "available"
                    ? "bg-success"
                    : "bg-warning"
                  : "bg-muted-foreground"
              )}
            />
          </div>

          {/* Main Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground truncate">{member.name}</h3>
              <span
                className={clsx(
                  "text-xs px-2 py-0.5 rounded-full border",
                  getRoleColor(member.role)
                )}
              >
                {member.role}
              </span>
            </div>
            <p className="text-sm text-muted-foreground truncate">{member.email}</p>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{member.metrics.assignedLeads}</p>
            <p className="text-xs text-muted-foreground">Leads</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{member.metrics.openConversations}</p>
            <p className="text-xs text-muted-foreground">Open</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">{member.metrics.averageResponseTime}</p>
            <p className="text-xs text-muted-foreground">Resp. Time</p>
          </div>
        </div>
      </button>

      {/* Expandable Section */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 mt-3 pt-3 border-t border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{expanded ? "Show less" : "Show more"}</span>
        <ChevronDown className={clsx("w-4 h-4 transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Closed Conversations</p>
              <p className="font-medium text-foreground">{member.metrics.closedConversations}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Satisfaction Score</p>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-warning fill-warning" />
                <span className="font-medium text-foreground">{member.metrics.leadSatisfactionScore}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Workload</p>
              <p className={clsx("text-xs font-medium", getWorkloadColor(member.metrics.workloadCapacity))}>
                {member.metrics.workloadCapacity}%
              </p>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={clsx("h-full rounded-full transition-all", getWorkloadBarColor(member.metrics.workloadCapacity))}
                style={{ width: `${member.metrics.workloadCapacity}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Team Member Table Row (Desktop)
function TeamMemberRow({
  member,
  onSelect,
  isSelected,
}: {
  member: TeamMember;
  onSelect: () => void;
  isSelected: boolean;
}) {
  return (
    <tr
      onClick={onSelect}
      className={clsx(
        "border-b border-border cursor-pointer transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-secondary/50"
      )}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold">
              {getInitials(member.name)}
            </div>
            <span
              className={clsx(
                "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card",
                member.status === "active"
                  ? member.availability === "available"
                    ? "bg-success"
                    : "bg-warning"
                  : "bg-muted-foreground"
              )}
            />
          </div>
          <div>
            <p className="font-medium text-foreground">{member.name}</p>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={clsx("text-xs px-2 py-1 rounded-full border", getRoleColor(member.role))}>
          {member.role}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              member.status === "active" ? "bg-success" : "bg-muted-foreground"
            )}
          />
          <span className="text-sm text-foreground capitalize">{member.status}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span
          className={clsx(
            "text-xs px-2 py-1 rounded-full",
            member.availability === "available"
              ? "bg-success/20 text-success"
              : "bg-warning/20 text-warning"
          )}
        >
          {member.availability}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="font-medium text-foreground">{member.metrics.assignedLeads}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="font-medium text-foreground">{member.metrics.openConversations}</span>
      </td>
      <td className="py-3 px-4 text-center">
        <span className="text-sm text-foreground">{member.metrics.averageResponseTime}</span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={clsx("h-full rounded-full", getWorkloadBarColor(member.metrics.workloadCapacity))}
              style={{ width: `${member.metrics.workloadCapacity}%` }}
            />
          </div>
          <span className={clsx("text-xs font-medium", getWorkloadColor(member.metrics.workloadCapacity))}>
            {member.metrics.workloadCapacity}%
          </span>
        </div>
      </td>
    </tr>
  );
}

// Member Detail Panel
function MemberDetailPanel({
  member,
  onClose,
  isMobile,
}: {
  member: TeamMember | null;
  onClose: () => void;
  isMobile: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "metrics" | "settings">("overview");

  if (!member) return null;

  const content = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Member Details</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Section */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-semibold">
              {getInitials(member.name)}
            </div>
            <span
              className={clsx(
                "absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-card",
                member.status === "active"
                  ? member.availability === "available"
                    ? "bg-success"
                    : "bg-warning"
                  : "bg-muted-foreground"
              )}
            />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground">{member.name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={clsx("text-xs px-2 py-0.5 rounded-full border", getRoleColor(member.role))}>
                {member.role}
              </span>
              <span
                className={clsx(
                  "text-xs px-2 py-0.5 rounded-full",
                  member.availability === "available"
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
                )}
              >
                {member.availability}
              </span>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-secondary transition-colors">
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["overview", "metrics", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "flex-1 py-3 text-sm font-medium transition-colors border-b-2",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{member.email}</span>
              </div>
              {member.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{member.phone}</span>
                </div>
              )}
              {member.department && (
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{member.department}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">Joined {formatDate(member.joinedAt)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Quick Stats</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-foreground">{member.metrics.assignedLeads}</p>
                  <p className="text-xs text-muted-foreground">Assigned Leads</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <p className="text-2xl font-semibold text-foreground">{member.metrics.openConversations}</p>
                  <p className="text-xs text-muted-foreground">Open Conversations</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "metrics" && (
          <div className="space-y-4">
            <div className="bg-secondary/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Workload Capacity</span>
                </div>
                <span className={clsx("font-semibold", getWorkloadColor(member.metrics.workloadCapacity))}>
                  {member.metrics.workloadCapacity}%
                </span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className={clsx("h-full rounded-full transition-all", getWorkloadBarColor(member.metrics.workloadCapacity))}
                  style={{ width: `${member.metrics.workloadCapacity}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-accent" />
                  <span className="text-xs text-muted-foreground">Avg Response</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{member.metrics.averageResponseTime}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-xs text-muted-foreground">Closed</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{member.metrics.closedConversations}</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-warning" />
                  <span className="text-xs text-muted-foreground">Satisfaction</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{member.metrics.leadSatisfactionScore}/5</p>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Assigned</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{member.metrics.assignedLeads}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Auto-Assignment Factors</h4>
              <p className="text-xs text-muted-foreground mb-2">
                These metrics are used for automatic lead assignment:
              </p>
              <ul className="space-y-2 text-sm text-foreground">
                <li className="flex items-center justify-between">
                  <span>Response Speed</span>
                  <span className="text-success">{member.metrics.averageResponseTime}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Current Workload</span>
                  <span className={getWorkloadColor(member.metrics.workloadCapacity)}>{member.metrics.workloadCapacity}%</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Availability</span>
                  <span className={member.availability === "available" ? "text-success" : "text-warning"}>
                    {member.availability}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Closure Rate</span>
                  <span className="text-foreground">{member.metrics.closedConversations} closed</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Satisfaction Score</span>
                  <span className="text-warning">{member.metrics.leadSatisfactionScore}/5</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3">Member Actions</h4>
              <div className="space-y-2">
                <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary transition-colors">
                  <Edit2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Edit Member Details</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary transition-colors">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Change Role</span>
                </button>
                {member.status === "active" ? (
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                    <UserX className="w-4 h-4" />
                    <span className="text-sm">Deactivate Member</span>
                  </button>
                ) : (
                  <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-success/30 text-success hover:bg-success/10 transition-colors">
                    <UserCheck className="w-4 h-4" />
                    <span className="text-sm">Activate Member</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-foreground mb-3">Lead Assignment</h4>
              <div className="space-y-2">
                <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary transition-colors">
                  <Zap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Assign Leads</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary transition-colors">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">View Assignment History</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
        <div className="fixed inset-x-0 bottom-0 top-16 bg-card border-t border-border rounded-t-2xl z-50 animate-in slide-in-from-bottom">
          {content}
        </div>
      </>
    );
  }

  return (
    <div className="w-80 xl:w-96 bg-card border-l border-border flex-shrink-0">
      {content}
    </div>
  );
}

// Add Member Modal
function AddMemberModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    role: "Sale" as TeamMemberRole,
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-card border border-border rounded-xl z-50 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add Team Member</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter full name"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@smartkorp.com"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Phone (optional)</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+66 XX XXX XXXX"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as TeamMemberRole })}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="Sale">Sale</option>
              <option value="Sale Manager">Sale Manager</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border text-foreground font-medium rounded-lg hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Add Member
          </button>
        </div>
      </div>
    </>
  );
}

// Main Component
export default function TeamMemberManagement() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNavItem, setActiveNavItem] = useState("team");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Filter members based on search and filters
  const filteredMembers = useMemo(() => {
    return mockTeamMembers.filter((member) => {
      const matchesSearch =
        searchQuery === "" ||
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === "all" || member.role === roleFilter;
      const matchesStatus = statusFilter === "all" || member.status === statusFilter;
      const matchesAvailability = availabilityFilter === "all" || member.availability === availabilityFilter;

      return matchesSearch && matchesRole && matchesStatus && matchesAvailability;
    });
  }, [searchQuery, roleFilter, statusFilter, availabilityFilter]);

  const roleOptions = [
    { value: "all", label: "All Roles" },
    { value: "Admin", label: "Admin" },
    { value: "Sale Manager", label: "Sale Manager" },
    { value: "Sale", label: "Sale" },
  ];

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  const availabilityOptions = [
    { value: "all", label: "All Availability" },
    { value: "available", label: "Available" },
    { value: "busy", label: "Busy" },
  ];

  const activeFiltersCount =
    (roleFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (availabilityFilter !== "all" ? 1 : 0);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeItem={activeNavItem}
        onItemClick={setActiveNavItem}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-border bg-card">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold text-foreground">Team Members</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage your team and track performance
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Member</span>
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Filters Bar */}
            <div className="px-4 md:px-6 py-4 border-b border-border bg-card/50">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  />
                </div>

                {/* Desktop Filters */}
                <div className="hidden md:flex items-center gap-2">
                  <FilterDropdown
                    label="Role"
                    value={roleFilter}
                    options={roleOptions}
                    onChange={setRoleFilter}
                    isOpen={openDropdown === "role"}
                    onToggle={() => setOpenDropdown(openDropdown === "role" ? null : "role")}
                  />
                  <FilterDropdown
                    label="Status"
                    value={statusFilter}
                    options={statusOptions}
                    onChange={setStatusFilter}
                    isOpen={openDropdown === "status"}
                    onToggle={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                  />
                  <FilterDropdown
                    label="Availability"
                    value={availabilityFilter}
                    options={availabilityOptions}
                    onChange={setAvailabilityFilter}
                    isOpen={openDropdown === "availability"}
                    onToggle={() => setOpenDropdown(openDropdown === "availability" ? null : "availability")}
                  />
                </div>

                {/* Mobile Filter Button */}
                <button
                  onClick={() => setShowMobileFilters(true)}
                  className="md:hidden flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-foreground hover:bg-secondary transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  <span className="text-sm">Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 text-xs bg-primary text-primary-foreground rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                {/* View Toggle (Desktop) */}
                <div className="hidden lg:flex items-center gap-1 border border-border rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("table")}
                    className={clsx(
                      "p-1.5 rounded transition-colors",
                      viewMode === "table" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Table view"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={clsx(
                      "p-1.5 rounded transition-colors",
                      viewMode === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Active Filters Tags */}
              {activeFiltersCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {roleFilter !== "all" && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      Role: {roleFilter}
                      <button onClick={() => setRoleFilter("all")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {statusFilter !== "all" && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      Status: {statusFilter}
                      <button onClick={() => setStatusFilter("all")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {availabilityFilter !== "all" && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                      Availability: {availabilityFilter}
                      <button onClick={() => setAvailabilityFilter("all")}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setRoleFilter("all");
                      setStatusFilter("all");
                      setAvailabilityFilter("all");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>

            {/* Members List/Table */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
              {filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No members found</h3>
                  <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className={clsx("hidden", viewMode === "table" ? "lg:block" : "")}>
                    <div className="bg-card border border-border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Member</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Role</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Availability</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Leads</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Open</th>
                            <th className="text-center py-3 px-4 text-sm font-medium text-muted-foreground">Resp. Time</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Workload</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMembers.map((member) => (
                            <TeamMemberRow
                              key={member.id}
                              member={member}
                              onSelect={() => setSelectedMember(member)}
                              isSelected={selectedMember?.id === member.id}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Desktop Grid View */}
                  <div className={clsx("hidden", viewMode === "grid" ? "lg:grid" : "", "grid-cols-2 xl:grid-cols-3 gap-4")}>
                    {filteredMembers.map((member) => (
                      <TeamMemberCard
                        key={member.id}
                        member={member}
                        onSelect={() => setSelectedMember(member)}
                        isSelected={selectedMember?.id === member.id}
                      />
                    ))}
                  </div>

                  {/* Tablet Grid */}
                  <div className="hidden md:grid lg:hidden grid-cols-2 gap-4">
                    {filteredMembers.map((member) => (
                      <TeamMemberCard
                        key={member.id}
                        member={member}
                        onSelect={() => setSelectedMember(member)}
                        isSelected={selectedMember?.id === member.id}
                      />
                    ))}
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {filteredMembers.map((member) => (
                      <TeamMemberCard
                        key={member.id}
                        member={member}
                        onSelect={() => setSelectedMember(member)}
                        isSelected={selectedMember?.id === member.id}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Desktop Detail Panel */}
          {selectedMember && (
            <MemberDetailPanel
              member={selectedMember}
              onClose={() => setSelectedMember(null)}
              isMobile={false}
            />
          )}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <MobileNav activeItem={activeNavItem} onItemClick={setActiveNavItem} />

      {/* Mobile Detail Panel */}
      <div className="md:hidden">
        {selectedMember && (
          <MemberDetailPanel
            member={selectedMember}
            onClose={() => setSelectedMember(null)}
            isMobile={true}
          />
        )}
      </div>

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={showMobileFilters}
        onClose={() => setShowMobileFilters(false)}
        roleFilter={roleFilter}
        statusFilter={statusFilter}
        availabilityFilter={availabilityFilter}
        onRoleChange={setRoleFilter}
        onStatusChange={setStatusFilter}
        onAvailabilityChange={setAvailabilityFilter}
      />

      {/* Add Member Modal */}
      <AddMemberModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
