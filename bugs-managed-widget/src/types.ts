export interface BugsManagedConfig {
  apiKey: string;
  apiUrl: string;
  userEmail?: string;
  userName?: string;
  theme?: 'dark' | 'light';
  position?: 'bottom-right' | 'bottom-left';
  orbSize?: number;
  orbColors?: [string, string];

  // Multi-tenant context (optional - for managed platform apps)
  tenantId?: string;
  tenantName?: string;
  databaseName?: string;
  appVersion?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}
