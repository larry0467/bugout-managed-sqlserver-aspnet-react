// IIFE entry — builds a self-contained <script> bundle of the Bug Out
// Managed widget for embedding in host apps that aren't bundling React with
// us (e.g. the Managed Platform Console, which uses React 19 — bundling our
// own React 18 here keeps the two trees totally separate).
//
// Usage in the host's index.html:
//
//   <script>
//     window.__BUG_OUT_CONFIG__ = {
//       apiKey: "dev-something-key",
//       apiUrl: "https://bugout-api-dev.managedplatform.com/api",
//       userEmail: "owner@example.com",
//       userName: "Owner",
//       theme: "dark",
//       position: "bottom-left",
//       orbColors: ["#4caf50", "#ff9800"],
//     };
//   </script>
//   <script src="/widget.iife.js" defer></script>
//
// The script auto-mounts the widget into a dedicated <div id="bug-out-managed-root">
// appended to document.body and registers window.BugOutManagedWidget for
// imperative .open()/.close() control later if a host wants it.
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import BugOutManagedWidget from './BugsManagedWidget';
import type { BugOutManagedConfig } from './types';

declare global {
  interface Window {
    __BUG_OUT_CONFIG__?: BugOutManagedConfig;
    BugOutManagedWidget?: {
      mount: (config: BugOutManagedConfig) => void;
      unmount: () => void;
    };
  }
}

const ROOT_ID = 'bug-out-managed-root';

let root: Root | null = null;

function getOrCreateRoot(): HTMLDivElement {
  let el = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

function mount(config: BugOutManagedConfig) {
  const container = getOrCreateRoot();
  if (!root) root = createRoot(container);
  root.render(React.createElement(BugOutManagedWidget, config));
}

function unmount() {
  if (root) {
    root.unmount();
    root = null;
  }
  const el = document.getElementById(ROOT_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

window.BugOutManagedWidget = { mount, unmount };

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
