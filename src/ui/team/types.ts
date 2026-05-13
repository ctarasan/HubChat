export type TeamMemberStatus = "active" | "inactive";
export type TeamMemberAvailability = "available" | "busy";
export type TeamMemberRole = "Admin" | "Sale Manager" | "Sale";

export interface TeamMemberMetrics {
  assignedLeads: number;
  openConversations: number;
  averageResponseTime: string;
  closedConversations: number;
  leadSatisfactionScore: number;
  workloadCapacity: number; // percentage 0-100
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  availability: TeamMemberAvailability;
  avatarUrl?: string | null;
  phone?: string | null;
  department?: string | null;
  joinedAt: string;
  lastActiveAt?: string | null;
  metrics: TeamMemberMetrics;
}

// Mock data for demonstration
export const mockTeamMembers: TeamMember[] = [
  {
    id: "1",
    name: "Sarah Chen",
    email: "sarah.chen@smartkorp.com",
    role: "Admin",
    status: "active",
    availability: "available",
    avatarUrl: null,
    phone: "+66 81 234 5678",
    department: "Sales Operations",
    joinedAt: "2023-01-15T08:00:00Z",
    lastActiveAt: "2024-01-10T14:30:00Z",
    metrics: {
      assignedLeads: 45,
      openConversations: 12,
      averageResponseTime: "2m 30s",
      closedConversations: 156,
      leadSatisfactionScore: 4.8,
      workloadCapacity: 75,
    },
  },
  {
    id: "2",
    name: "Michael Wong",
    email: "michael.wong@smartkorp.com",
    role: "Sale Manager",
    status: "active",
    availability: "busy",
    avatarUrl: null,
    phone: "+66 82 345 6789",
    department: "Enterprise Sales",
    joinedAt: "2023-03-20T09:00:00Z",
    lastActiveAt: "2024-01-10T15:45:00Z",
    metrics: {
      assignedLeads: 38,
      openConversations: 18,
      averageResponseTime: "3m 15s",
      closedConversations: 203,
      leadSatisfactionScore: 4.6,
      workloadCapacity: 90,
    },
  },
  {
    id: "3",
    name: "Priya Sharma",
    email: "priya.sharma@smartkorp.com",
    role: "Sale",
    status: "active",
    availability: "available",
    avatarUrl: null,
    phone: "+66 83 456 7890",
    department: "SMB Sales",
    joinedAt: "2023-06-10T10:00:00Z",
    lastActiveAt: "2024-01-10T16:20:00Z",
    metrics: {
      assignedLeads: 52,
      openConversations: 8,
      averageResponseTime: "1m 45s",
      closedConversations: 178,
      leadSatisfactionScore: 4.9,
      workloadCapacity: 65,
    },
  },
  {
    id: "4",
    name: "David Kim",
    email: "david.kim@smartkorp.com",
    role: "Sale",
    status: "inactive",
    availability: "busy",
    avatarUrl: null,
    phone: "+66 84 567 8901",
    department: "Enterprise Sales",
    joinedAt: "2023-02-28T11:00:00Z",
    lastActiveAt: "2024-01-05T09:00:00Z",
    metrics: {
      assignedLeads: 15,
      openConversations: 3,
      averageResponseTime: "5m 20s",
      closedConversations: 89,
      leadSatisfactionScore: 4.2,
      workloadCapacity: 25,
    },
  },
  {
    id: "5",
    name: "Lisa Tanaka",
    email: "lisa.tanaka@smartkorp.com",
    role: "Sale",
    status: "active",
    availability: "available",
    avatarUrl: null,
    phone: "+66 85 678 9012",
    department: "SMB Sales",
    joinedAt: "2023-08-15T08:30:00Z",
    lastActiveAt: "2024-01-10T17:00:00Z",
    metrics: {
      assignedLeads: 61,
      openConversations: 15,
      averageResponseTime: "2m 10s",
      closedConversations: 142,
      leadSatisfactionScore: 4.7,
      workloadCapacity: 85,
    },
  },
  {
    id: "6",
    name: "John Martinez",
    email: "john.martinez@smartkorp.com",
    role: "Sale Manager",
    status: "active",
    availability: "busy",
    avatarUrl: null,
    phone: "+66 86 789 0123",
    department: "Enterprise Sales",
    joinedAt: "2022-11-01T09:00:00Z",
    lastActiveAt: "2024-01-10T14:00:00Z",
    metrics: {
      assignedLeads: 28,
      openConversations: 22,
      averageResponseTime: "4m 00s",
      closedConversations: 267,
      leadSatisfactionScore: 4.5,
      workloadCapacity: 95,
    },
  },
  {
    id: "7",
    name: "Emma Wilson",
    email: "emma.wilson@smartkorp.com",
    role: "Sale",
    status: "active",
    availability: "available",
    avatarUrl: null,
    phone: "+66 87 890 1234",
    department: "SMB Sales",
    joinedAt: "2023-09-20T10:00:00Z",
    lastActiveAt: "2024-01-10T16:45:00Z",
    metrics: {
      assignedLeads: 33,
      openConversations: 6,
      averageResponseTime: "1m 55s",
      closedConversations: 98,
      leadSatisfactionScore: 4.8,
      workloadCapacity: 55,
    },
  },
  {
    id: "8",
    name: "Alex Nguyen",
    email: "alex.nguyen@smartkorp.com",
    role: "Sale",
    status: "inactive",
    availability: "busy",
    avatarUrl: null,
    phone: "+66 88 901 2345",
    department: "Enterprise Sales",
    joinedAt: "2023-04-05T08:00:00Z",
    lastActiveAt: "2024-01-02T11:30:00Z",
    metrics: {
      assignedLeads: 8,
      openConversations: 2,
      averageResponseTime: "8m 30s",
      closedConversations: 45,
      leadSatisfactionScore: 3.9,
      workloadCapacity: 15,
    },
  },
];

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getStatusColor(status: TeamMemberStatus): string {
  return status === "active" ? "bg-success" : "bg-muted-foreground";
}

export function getAvailabilityColor(availability: TeamMemberAvailability): string {
  return availability === "available" ? "bg-success" : "bg-warning";
}

export function getRoleColor(role: TeamMemberRole): string {
  switch (role) {
    case "Admin":
      return "bg-accent/20 text-accent border-accent/30";
    case "Sale Manager":
      return "bg-primary/20 text-primary border-primary/30";
    case "Sale":
      return "bg-secondary text-secondary-foreground border-border";
    default:
      return "bg-secondary text-secondary-foreground border-border";
  }
}

export function getWorkloadColor(capacity: number): string {
  if (capacity >= 90) return "text-destructive";
  if (capacity >= 70) return "text-warning";
  return "text-success";
}

export function getWorkloadBarColor(capacity: number): string {
  if (capacity >= 90) return "bg-destructive";
  if (capacity >= 70) return "bg-warning";
  return "bg-success";
}
