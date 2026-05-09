export interface BugOutConfig {
  apiKey: string;
  apiUrl: string;
}

export interface CommsConfig {
  apiKey: string;
  apiUrl: string;
  workspaceId: string;
  /** System sender UUID registered in Comms for Bug Out outbound messages. */
  senderUserId: string;
}

export interface UserConfig {
  email?: string;
  name?: string;
}

export interface UnifiedLauncherConfig {
  bugout: BugOutConfig;
  comms: CommsConfig;
  user?: UserConfig;
  /** Entity scope for message threads, e.g. "ticket:42". */
  entityId?: string;
  entityTitle?: string;
  theme?: 'dark' | 'light';
  position?: 'bottom-right' | 'bottom-left';
  /** Hex accent color for the orb glow, panel tabs, send button, etc. Defaults to '#6366f1' (indigo). */
  accentColor?: string;
  appName?: string;
  tenantId?: string;
  tenantName?: string;
  appVersion?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}

export type PanelSize = 'mini' | 'large' | 'fullscreen';
export type PanelTab  = 'bug' | 'messages';

// ---------------------------------------------------------------------------
// Comms wire shapes (subset of what CommsManaged.Api returns)
// ---------------------------------------------------------------------------

export interface CommsMessage {
  id: string;
  threadId: string;
  senderName: string;
  senderUserId: string;
  body: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  entityId?: string;
  entityRef?: string;
  entityTitle?: string;
  sentAt: string;
}

/** Client-side thread derived by grouping messages. */
export interface CommsThread {
  id: string;
  subject: string;
  lastMessageAt: string;
  entityRef?: string;
  entityTitle?: string;
  messages: CommsMessage[];
  unreadCount: number;
}
