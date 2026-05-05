// IIFE entry — builds a self-contained <script> bundle of the Bug Out
// Managed widget for embedding in host apps that aren't bundling React with
// us. Bundling React 18 here keeps the widget's tree totally separate from
// the host app's React version.
//
// Usage in the host's index.html:
//
//   <script>
//     window.__BUG_OUT_CONFIG__ = {
//       apiKey: "your-api-key",
//       apiUrl: "https://api.your-domain.com/api",
//       userEmail: "user@example.com",
//       userName: "User Name",
//       theme: "dark",
//       position: "bottom-left",
//       orbColors: ["#4caf50", "#ff9800"],
//     };
//   </script>
//   <script src="/widget.iife.js" defer></script>
//
// The widget registers itself with window.__ManagedLauncher__ (the Managed
// Platform unified launcher protocol). If no other launcher has loaded yet,
// Bug Out creates a ManagedLauncherOrb and claims the orb host role. When a
// higher-priority host loads later (e.g. Comms Managed), it calls
// window.__ManagedLauncher__.revokeHost() — Bug Out's orb tears itself down
// and the new host's orb takes over, already showing Bug Out in its menu.
//
// The widget itself (BugsManagedWidget) is mounted with hideOrb=true so it
// only renders the modal panel — the launcher owns the floating button.
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BugOutManagedWidget from './BugsManagedWidget';
import ManagedLauncherOrb from './launcher/ManagedLauncherOrb';
import { getOrCreateRegistry } from './launcher/LauncherRegistry';
import type { BugOutManagedConfig } from './types';

declare global {
  interface Window {
    __BUG_OUT_CONFIG__?: BugOutManagedConfig;
    BugOutManagedWidget?: {
      mount: (config: BugOutManagedConfig) => void;
      unmount: () => void;
      open: () => void;
      close: () => void;
      /** Update the submitter identity after the user logs in. Safe to call
       *  multiple times (e.g. on auth state change). Re-renders the panel in
       *  place — no flash, no remount, no lost state. */
      setUser: (email: string, name: string) => void;
    };
  }
}

const ROOT_ID = 'bug-out-managed-root';
const LAUNCHER_ROOT_ID = 'managed-launcher-root';

let root: Root | null = null;
let launcherRoot: Root | null = null;
let widgetApi: { open: () => void; close: () => void } | null = null;
let isLauncherHost = false;
let currentConfig: BugOutManagedConfig | null = null;

function getOrCreateContainer(id: string): HTMLDivElement {
  let el = document.getElementById(id) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

function tearDownLauncherOrb() {
  if (launcherRoot) {
    launcherRoot.unmount();
    launcherRoot = null;
  }
  const el = document.getElementById(LAUNCHER_ROOT_ID);
  if (el?.parentNode) el.parentNode.removeChild(el);
  isLauncherHost = false;
}

function mount(config: BugOutManagedConfig) {
  currentConfig = config;
  const registry = getOrCreateRegistry();

  // Try to claim the orb host role. If Comms (or another launcher) already
  // owns it, skip rendering our orb — the existing host's menu will gain the
  // Bug Out entry once onApiReady fires below.
  isLauncherHost = registry.claimHost('bugout-managed', tearDownLauncherOrb);

  // Render the modal panel only (the launcher owns the floating button).
  const container = getOrCreateContainer(ROOT_ID);
  if (!root) root = createRoot(container);
  root.render(
    React.createElement(BugOutManagedWidget, {
      ...config,
      hideOrb: true,
      onApiReady: (api) => {
        widgetApi = api;
        registry.register({
          id: 'bugout-managed',
          label: 'Bug Out Managed',
          icon: '🐛',
          open: api.open,
          close: api.close,
        });
      },
    })
  );

  if (isLauncherHost) {
    const launcherContainer = getOrCreateContainer(LAUNCHER_ROOT_ID);
    if (!launcherRoot) launcherRoot = createRoot(launcherContainer);
    launcherRoot.render(
      React.createElement(ManagedLauncherOrb, {
        position: config.position,
        theme: config.theme,
      })
    );
  }
}

function unmount() {
  const registry = getOrCreateRegistry();
  registry.unregister('bugout-managed');

  if (isLauncherHost) {
    registry.releaseHost('bugout-managed');
    tearDownLauncherOrb();
  }

  if (root) {
    root.unmount();
    root = null;
  }
  widgetApi = null;

  const el = document.getElementById(ROOT_ID);
  if (el?.parentNode) el.parentNode.removeChild(el);
}

window.BugOutManagedWidget = {
  mount,
  unmount,
  open: () => widgetApi?.open(),
  close: () => widgetApi?.close(),
  setUser: (email: string, name: string) => {
    if (!currentConfig) return;
    // Re-render with updated identity. React diffs props in place — no flash,
    // no modal close, no lost form state. The launcher orb is unaffected.
    mount({ ...currentConfig, userEmail: email, userName: name });
  },
};

function autoMount() {
  const cfg = window.__BUG_OUT_CONFIG__;
  if (cfg && cfg.apiKey && cfg.apiUrl) {
    mount(cfg);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}
