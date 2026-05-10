import { useEffect, useMemo } from 'react';
import type { CommsConfig, PanelSize, UserConfig } from '../types';

// ---------------------------------------------------------------------------
// MessagesTab — thin iframe shell that embeds the full Comms Managed chat
// surface. Single source of truth lives in the Comms SPA so all consumers
// (cockpit, Bug Out, future Managed apps) get the same UI without duplicating
// React components into this TS widget.
// ---------------------------------------------------------------------------

interface Props {
  commsConfig: CommsConfig;
  user: UserConfig | undefined;
  entityId: string | undefined;
  size: PanelSize;
  theme: 'dark' | 'light';
  onUnreadChange: (n: number) => void;
  accentColor: string;
}

// apiUrl looks like "https://comms-api.managedplatform.com" → frontend is
// "https://comms.managedplatform.com". For local dev, swap :5080 → :5173.
function deriveAppUrl(apiUrl: string): string {
  try {
    const u = new URL(apiUrl);
    if (u.hostname.includes('comms-api')) {
      u.hostname = u.hostname.replace('comms-api', 'comms');
      u.pathname = '/';
      return u.origin;
    }
    if (u.port === '5080') {
      u.port = '5173';
      return u.origin;
    }
    return u.origin.replace('//api.', '//app.');
  } catch {
    return 'https://comms.managedplatform.com';
  }
}

export default function MessagesTab({ commsConfig, user, entityId, size, theme, onUnreadChange, accentColor }: Props) {
  const isDark = theme === 'dark';

  useEffect(() => { onUnreadChange(0); }, [onUnreadChange]);

  const src = useMemo(() => {
    const appUrl = deriveAppUrl(commsConfig.apiUrl);
    const qs = new URLSearchParams({
      embedded: '1',
      view: 'chat',
      size,
      theme,
      accent: accentColor,
      api_key: commsConfig.apiKey,
      workspaceId: commsConfig.workspaceId,
    });
    if (entityId) qs.set('entity', entityId);
    if (user?.email) qs.set('userEmail', user.email);
    if (user?.name) qs.set('userName', user.name);
    return `${appUrl}/?${qs}`;
  }, [commsConfig, user, entityId, size, theme, accentColor]);

  return (
    <iframe
      title="Comms Managed"
      src={src}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        border: 'none',
        background: isDark ? '#0f172a' : '#ffffff',
      }}
      allow="clipboard-read; clipboard-write"
    />
  );
}
