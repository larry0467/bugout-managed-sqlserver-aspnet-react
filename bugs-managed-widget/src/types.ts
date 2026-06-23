/**
 * A custom entry the host app adds to the launcher orb menu (e.g. "Take a tour of
 * this page"). Rendered alongside the built-in Bug Out tool; selecting it runs the
 * host-provided `onSelect`. Because actions surface through the shared launcher,
 * passing one (or more) guarantees the orb shows its menu even when Bug Out is the
 * only other tool present.
 */
export interface BugOutMenuAction {
  /** Stable id, unique per host app. Used for (un)registration. */
  id: string;
  /** Menu label shown to the user. */
  label: string;
  /** Optional emoji/glyph shown left of the label (matches the orb's tool icons). */
  icon?: string;
  /** Invoked when the user selects the item. The host owns what it does. */
  onSelect: () => void;
}

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

  // When true the widget renders only the modal panel — no floating orb button.
  // Set by the IIFE entry when the ManagedLauncherOrb is handling the orb instead.
  hideOrb?: boolean;

  // Optional custom entries the host adds to the launcher orb menu (e.g. a guided
  // tour of the current page). Registered as launcher tools by the IIFE entry, so
  // they appear in the same menu as the built-in Bug Out tool.
  actions?: BugOutMenuAction[];
}
