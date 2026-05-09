import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// ManagedLauncher — injects the unified Managed Platform Launcher widget.
//
// One orb replaces any future standalone widget/orb additions. The launcher
// bundle (launcher.iife.js) is self-contained: it bundles React 18 internally
// so it's fully insulated from the admin app's React tree.
//
// The panel has two tabs:
//   🐛 Report    — Bug Out submission flow (screen recording, screenshots, etc.)
//   💬 Messages  — Comms chat threaded to the current entity
//
// Entity scoping: when the admin is viewing /tickets/<id>, the Messages tab
// auto-scopes to that ticket's Comms thread. Navigation changes are detected
// via a popstate + pushState/replaceState monkey-patch so the entityId updates
// without a full page reload.
//
// Position: bottom-RIGHT — there is no JARVIS chrome on the right side of the
// Bug Out admin.
// ---------------------------------------------------------------------------

const SCRIPT_ID  = 'managed-launcher-script';
const SCRIPT_SRC = 'https://bugout-api.managedplatform.com/launcher.iife.js';

const DEFAULT_BUGOUT_API_URL     = 'https://bugout-api.managedplatform.com/api';
const DEFAULT_BUGOUT_API_KEY     = 'bom_1f91d205edb8649d18f53b528fa4c29b';

const DEFAULT_COMMS_API_URL      = 'https://comms-api.managedplatform.com/api';
const DEFAULT_COMMS_API_KEY      = 'dev-bugout-key';
const DEFAULT_COMMS_WORKSPACE_ID = '5835c29a-72df-4717-a22c-1ac57ccfaa90';
const DEFAULT_COMMS_SENDER_ID    = '72abe56c-2a3b-4512-8e57-18abf996824b';

interface LauncherGlobal {
  __MANAGED_LAUNCHER_CONFIG__?: {
    bugout:       { apiKey: string; apiUrl: string };
    comms:        { apiKey: string; apiUrl: string; workspaceId: string; senderUserId: string };
    user?:        { email?: string; name?: string };
    theme?:       'dark' | 'light';
    position?:    'bottom-right' | 'bottom-left';
    accentColor?: string;
    tenantId?:    string;
    tenantName?:  string;
    entityId?:    string;
    environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
    appVersion?:  string;
  };
  ManagedLauncher?: {
    mount:   (config: LauncherGlobal['__MANAGED_LAUNCHER_CONFIG__']) => void;
    unmount: () => void;
    open:    (tab?: 'bug' | 'messages') => void;
    close:   () => void;
    setUser: (email: string, name: string) => void;
    setEntityId: (entityId: string | undefined) => void;
  };
}

function readEnv(key: string, fallback: string): string {
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v && v.length > 0 ? v : fallback;
}

/** Extract ticket ID from path like /tickets/42 or /tickets/42/... */
function ticketEntityId(): string | undefined {
  const m = window.location.pathname.match(/\/tickets\/(\d+)/);
  return m ? `ticket:${m[1]}` : undefined;
}

interface Props {
  userEmail?: string;
  userName?:  string;
}

export default function ManagedLauncher({ userEmail, userName }: Props) {
  useEffect(() => {
    const env = readEnv('VITE_ENV', 'PRODUCTION') as 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';

    const buildConfig = (): LauncherGlobal['__MANAGED_LAUNCHER_CONFIG__'] => ({
      bugout: {
        apiKey: readEnv('VITE_BUG_OUT_API_KEY', DEFAULT_BUGOUT_API_KEY),
        apiUrl: readEnv('VITE_BUG_OUT_API_URL', DEFAULT_BUGOUT_API_URL),
      },
      comms: {
        apiKey:       readEnv('VITE_COMMS_API_KEY',       DEFAULT_COMMS_API_KEY),
        apiUrl:       readEnv('VITE_COMMS_API_URL',       DEFAULT_COMMS_API_URL),
        workspaceId:  readEnv('VITE_COMMS_WORKSPACE_ID',  DEFAULT_COMMS_WORKSPACE_ID),
        senderUserId: readEnv('VITE_COMMS_SENDER_ID',     DEFAULT_COMMS_SENDER_ID),
      },
      user: {
        email: userEmail,
        name:  userName ?? (userEmail ? userEmail.split('@')[0] : 'Admin'),
      },
      theme:       'dark',
      position:    'bottom-right',
      accentColor: '#4caf50',   // Bug Out admin primary brand green
      tenantId:    'bugout-admin',
      tenantName:  'Bug Out Managed',
      entityId:    ticketEntityId(),
      environment: env,
      appVersion:  readEnv('VITE_APP_VERSION', '0.1.0'),
    });

    const config = buildConfig();
    (window as unknown as LauncherGlobal).__MANAGED_LAUNCHER_CONFIG__ = config;

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id    = SCRIPT_ID;
      script.src   = SCRIPT_SRC;
      script.defer = true;
      document.body.appendChild(script);
    } else {
      // Script already present — re-mount with updated identity (e.g. after login).
      const w = window as unknown as LauncherGlobal;
      w.ManagedLauncher?.mount(config);
    }

    // ------------------------------------------------------------------
    // Entity ID tracking: update the launcher as the user navigates
    // between routes (react-router pushes history entries without a
    // full page reload).
    // ------------------------------------------------------------------
    const syncEntity = () => {
      const w = window as unknown as LauncherGlobal;
      w.ManagedLauncher?.setEntityId?.(ticketEntityId());
    };

    // Monkey-patch pushState / replaceState so navigation events fire.
    const originalPush    = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);

    history.pushState = (...args) => { originalPush(...args);    syncEntity(); };
    history.replaceState = (...args) => { originalReplace(...args); syncEntity(); };

    window.addEventListener('popstate', syncEntity);

    return () => {
      window.removeEventListener('popstate', syncEntity);
      // Restore originals on unmount.
      history.pushState    = originalPush;
      history.replaceState = originalReplace;
      (window as unknown as LauncherGlobal).ManagedLauncher?.unmount();
    };
  }, [userEmail, userName]);

  return null;
}
