import axios from 'axios';

// When the SPA is served behind an SWA linked backend, /api is proxied
// same-origin and VITE_API_BASE_URL is empty. For envs without a linked
// backend (dev — Free-tier SWA), set VITE_API_BASE_URL to the API host
// (e.g. https://bugout-api-dev.managedplatform.com) at build time.
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${apiBaseUrl}/api`,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bom_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('bom_token');
      localStorage.removeItem('bom_user');
      localStorage.removeItem('bom_org');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Types

export interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
}

export type UserRole = 'PLATFORM_OWNER' | 'SUPER_ADMIN' | 'DEVELOPER' | 'VIEWER';
export type DeveloperSpecialty = 'FRONTEND' | 'BACKEND' | 'FULLSTACK';

export type EscalationStage =
  | 'NONE'
  | 'SUPER_ADMIN_REVIEW'
  | 'PLATFORM_OWNER_REVIEW'
  | 'ASSIGNED_HUMAN'
  | 'ASSIGNED_CLAUDE'
  | 'OWNER_APPROVAL_PENDING'
  | 'COMPLETED';

export type AssigneeType = 'HUMAN' | 'CLAUDE' | null;

export type ClaudeRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CAPPED';
export type ClaudeModel = 'sonnet' | 'opus';

export interface ClaudeRun {
  id: number;
  status: ClaudeRunStatus;
  model: ClaudeModel | string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  analysisMarkdown?: string;
  prUrl?: string;
  branchName?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: number;
}

export interface Project {
  id: number;
  organizationId?: number;
  name: string;
  slug: string;
  apiKey: string;
  webhookUrl?: string;
  slackWebhookUrl?: string;
  slackChannel?: string;
  slackBotToken?: string;
  notificationEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: number;
  projectId: number;
  submittedBy?: string;
  ticketType: 'BUG' | 'FEATURE_REQUEST' | 'QUESTION';
  title: string;
  description?: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'IN_REVIEW' | 'READY_FOR_TESTING' | 'VERIFIED' | 'RESOLVED' | 'CLOSED';
  currentPageUrl?: string;
  currentPageName?: string;
  browserInfo?: string;
  screenWidth?: number;
  screenHeight?: number;
  consoleErrors?: string;
  networkErrors?: string;
  transcript?: string;
  videoUrl?: string;
  videoSizeBytes?: number;
  videoDurationSeconds?: number;
  visibility: 'TENANT' | 'PLATFORM';
  developerCategory?: 'UI' | 'UX' | 'FRONTEND' | 'BACKEND' | 'FULLSTACK' | 'DEVOPS' | 'DATABASE' | 'MOBILE' | 'QA' | 'SECURITY' | 'API' | 'DATA_ENGINEERING' | 'INFRASTRUCTURE';
  assignedTo?: string;
  resolution?: string;
  escalatedBy?: string;
  escalatedAt?: string;
  resolvedAt?: string;
  // Gated escalation chain
  escalationStage?: EscalationStage;
  assigneeType?: AssigneeType;
  escalatedToOwnerAt?: string;
  escalatedToOwnerBy?: string;
  assignedAt?: string;
  assignedBy?: string;
  // Owner approval loop
  submittedForApprovalAt?: string | null;
  submittedForApprovalBy?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  revisionCount?: number;
  createdAt: string;
  updatedAt: string;
  // Multi-tenant fields
  tenantId?: string;
  tenantName?: string;
  databaseName?: string;
  applicationVersion?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}

export interface TicketNote {
  id: number;
  ticketId: number;
  authorEmail: string;
  authorName?: string;
  content: string;
  noteType: 'COMMENT' | 'QUESTION' | 'INTERNAL';
  source: 'DASHBOARD' | 'SLACK';
  slackThreadTs?: string;
  createdAt: string;
}

export interface ProjectStatsRow {
  projectId: number;
  name: string;
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
}

export interface TurnaroundStats {
  avgHours: number | null;
  medianHours: number | null;
  byProject: Array<{
    projectId: number;
    resolvedCount: number;
    avgHours: number;
    medianHours: number;
  }>;
}

export interface Stats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
  escalated: number;
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byProject: ProjectStatsRow[];
  turnaround: TurnaroundStats;
}

// Auth API

export const authApi = {
  register: (data: { email: string; password: string; fullName: string; organizationName: string }) =>
    api.post<{ token: string; user: AuthUser; organization: Organization }>('/auth/register', data).then(r => r.data),

  login: (email: string, password: string) =>
    api.post<{ token: string; user: AuthUser; organization: Organization }>('/auth/login', { email, password }).then(r => r.data),

  me: () => api.get('/auth/me').then(r => r.data),
};

// Project API

export const projectApi = {
  list: () => api.get<Project[]>('/projects').then(r => r.data),
  get: (id: number) => api.get<Project>(`/projects/${id}`).then(r => r.data),
  create: (name: string) => api.post<Project>('/projects', { name }).then(r => r.data),
  updateWebhooks: (id: number, data: { webhookUrl?: string; slackWebhookUrl?: string; notificationEmail?: string }) =>
    api.put<Project>(`/projects/${id}/webhooks`, data).then(r => r.data),
  updateSlack: (id: number, data: { slackWebhookUrl?: string; slackChannel?: string; slackBotToken?: string }) =>
    api.put<Project>(`/projects/${id}/slack`, data).then(r => r.data),
};

// Ticket API

export const ticketApi = {
  list: (projectId?: number, status?: string, type?: string) => {
    const params: any = {};
    if (projectId) params.projectId = projectId;
    if (status) params.status = status;
    if (type) params.type = type;
    return api.get<Ticket[]>('/tickets', { params }).then(r => r.data);
  },
  get: (id: number) => api.get<Ticket>(`/tickets/${id}`).then(r => r.data),
  updateStatus: (id: number, status: string, assignedTo?: string) =>
    api.put<Ticket>(`/tickets/${id}/status`, { status, assignedTo }).then(r => r.data),
  resolve: (id: number, resolution: string) =>
    api.put<Ticket>(`/tickets/${id}/resolve`, { resolution }).then(r => r.data),
  escalateToPlatformOwner: (id: number) =>
    api.post<Ticket>(`/tickets/${id}/escalate-to-platform-owner`).then(r => r.data),
  assignToHuman: (id: number, developerId: number, developerEmail: string) =>
    api.post<Ticket>(`/tickets/${id}/assign-to-human`, { developerId, developerEmail }).then(r => r.data),
  assignToClaude: (id: number, model: ClaudeModel = 'sonnet') =>
    api.post<{ id: number }>(`/tickets/${id}/assign-to-claude`, { model }).then(r => r.data),
  claudeRuns: (id: number) =>
    api.get<ClaudeRun[]>(`/tickets/${id}/claude-runs`).then(r => r.data),
  stats: (projectId?: number) => {
    const params: any = {};
    if (projectId) params.projectId = projectId;
    return api.get<Stats>(`/tickets/stats`, { params }).then(r => r.data);
  },
  // Owner approval loop
  submitForApproval: (id: number) =>
    api.post<Ticket>(`/tickets/${id}/submit-for-approval`).then(r => r.data),
  approve: (id: number) =>
    api.post<Ticket>(`/tickets/${id}/approve`).then(r => r.data),
  requestChanges: (id: number, reason: string) =>
    api.post<Ticket>(`/tickets/${id}/request-changes`, { reason }).then(r => r.data),
  videoUrl: (id: number) => `/api/tickets/${id}/video`,
};

// Performance Dashboard

export interface StageAverages {
  triageQueueMedianMinutes: number;
  triageQueueP90Minutes: number;
  ownerEscalationMedianMinutes: number;
  ownerEscalationP90Minutes: number;
  devWorkMedianMinutes: number;
  devWorkP90Minutes: number;
  ownerApprovalMedianMinutes: number;
  ownerApprovalP90Minutes: number;
  totalMedianMinutes: number;
  totalP90Minutes: number;
}

export type BottleneckStage = 'triageQueue' | 'ownerEscalation' | 'devWork' | 'ownerApproval';

export interface OwnerSpeedMetric {
  score: number;
  withinSlaCount: number;
  totalCount: number;
  medianMinutes: number;
}

export interface OwnerScore {
  platformOwnerEmail: string;
  ticketsHandled: number;
  escalationSpeed: OwnerSpeedMetric;
  approvalSpeed: OwnerSpeedMetric;
  compositeScore: number;
}

export interface DeveloperPerformance {
  email: string;
  displayName?: string;
  specialty: DeveloperSpecialty | null;
  ticketsResolved: number;
  medianDevWorkMinutes: number;
  p90DevWorkMinutes: number;
  score: number;
  withinSlaCount: number;
  totalCount: number;
  revisionRate: number;
}

export interface CategorySummary {
  category: string;
  ticketsResolved: number;
  medianDevWorkMinutes: number;
  score: number;
}

export interface ClaudePerformance {
  ticketsResolved: number;
  totalRuns: number;
  successfulRuns: number;
  cappedRuns: number;
  failedRuns: number;
  medianAgentRuntimeSeconds: number;
  medianEffectiveTurnaroundMinutes: number;
  medianCostUsd: number;
  totalCostUsd: number;
}

export interface PerformanceDashboard {
  window: { from: string; to: string; ticketsConsidered: number };
  stageAverages: StageAverages;
  bottleneckStage: BottleneckStage;
  ownerScore: OwnerScore;
  developers: DeveloperPerformance[];
  categorySummary: CategorySummary[];
  claude: ClaudePerformance;
}

export const dashboardApi = {
  performance: (params: { projectId?: number; from?: string; to?: string; priority?: string }) => {
    const q: any = {};
    if (params.projectId) q.projectId = params.projectId;
    if (params.from) q.from = params.from;
    if (params.to) q.to = params.to;
    if (params.priority) q.priority = params.priority;
    return api.get<PerformanceDashboard>('/dashboard/performance', { params: q }).then(r => r.data);
  },
};

// Team API

export interface TeamMember {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  specialty?: DeveloperSpecialty;
  createdAt: string;
}

export interface DeveloperOption {
  id: number;
  email: string;
  fullName: string;
  specialty?: DeveloperSpecialty;
}

export const teamApi = {
  list: () => api.get<TeamMember[]>('/team').then(r => r.data),
  invite: (data: { email: string; fullName: string; password: string; role: string; specialty?: string }) =>
    api.post<TeamMember>('/team/invite', data).then(r => r.data),
  updateRole: (userId: number, role: string, specialty?: string) =>
    api.put<TeamMember>(`/team/${userId}/role`, { role, specialty }).then(r => r.data),
  remove: (userId: number) =>
    api.delete(`/team/${userId}`).then(r => r.data),
  developers: (category?: string) => {
    const params: any = {};
    if (category) params.category = category;
    return api.get<DeveloperOption[]>('/team/developers', { params }).then(r => r.data);
  },
};

// Ticket assign

export const ticketAssignApi = {
  assign: (ticketId: number, assignedTo: string) =>
    api.put<Ticket>(`/tickets/${ticketId}/assign`, { assignedTo }).then(r => r.data),
  updateCategory: (ticketId: number, developerCategory: string) =>
    api.put<Ticket>(`/tickets/${ticketId}/category`, { developerCategory }).then(r => r.data),
};

// Notes API

export const noteApi = {
  list: (ticketId: number) =>
    api.get<TicketNote[]>(`/tickets/${ticketId}/notes`).then(r => r.data),
  add: (ticketId: number, content: string, noteType: string = 'COMMENT', authorName?: string) =>
    api.post<TicketNote>(`/tickets/${ticketId}/notes`, { content, noteType, authorName }).then(r => r.data),
  delete: (ticketId: number, noteId: number) =>
    api.delete(`/tickets/${ticketId}/notes/${noteId}`).then(r => r.data),
};

// Sandbox + capabilities

export interface SystemCapabilities {
  sandboxMode: boolean;
  anthropicEnabled: boolean;
}

export interface SandboxStatus {
  enabled: boolean;
  lastResetAt: string | null;
  lastResetBy: string | null;
  nextScheduledResetAt: string;
}

export interface SandboxResetResult {
  resetAt: string;
  bugsInserted: number;
  usersInserted: number;
}

export const systemApi = {
  capabilities: () => api.get<SystemCapabilities>('/system/capabilities').then(r => r.data),
};

export const sandboxApi = {
  status: () => api.get<SandboxStatus>('/admin/sandbox/status').then(r => r.data),
  reset: () => api.post<SandboxResetResult>('/admin/sandbox/reset').then(r => r.data),
};

export default api;
