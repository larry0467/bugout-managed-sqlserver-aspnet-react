export interface BugOutManagedConfig {
  apiKey: string;
  apiUrl: string;
  userEmail?: string;
  userName?: string;
  theme?: 'dark' | 'light';
  position?: 'bottom-right' | 'bottom-left';
  orbSize?: number;
  orbColors?: [string, string];

  // Multi-tenant context (optional — for apps that route multiple tenants)
  tenantId?: string;
  tenantName?: string;
  databaseName?: string;
  appVersion?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';

  // Called once after mount with an imperative handle. Used by host apps
  // that want to open/close the modal programmatically (e.g. a unified
  // launcher that hosts multiple tools under one orb).
  onApiReady?: (api: { open: () => void; close: () => void }) => void;
}
