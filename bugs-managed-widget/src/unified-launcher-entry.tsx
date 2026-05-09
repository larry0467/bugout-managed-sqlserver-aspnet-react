// Managed Platform Unified Launcher — single IIFE bundle replacing the
// separate Bug Out and Comms orbs. Embed with one <script> tag per app:
//
//   <script>
//     window.__MANAGED_LAUNCHER_CONFIG__ = {
//       bugout:  { apiKey: '...', apiUrl: 'https://bugout-api.managedplatform.com/api' },
//       comms:   { apiKey: '...', apiUrl: 'https://comms-api.managedplatform.com/api',
//                  workspaceId: '...', senderUserId: '...' },
//       user:    { email: 'user@example.com', name: 'User Name' },
//       entityId: 'ticket:42',   // optional — scopes messages to an entity
//       theme:    'dark',
//       position: 'bottom-left',
//       accentColor: '#6366f1',  // optional — hex accent; defaults to indigo
//       tenantId: 'my-app',
//     };
//   </script>
//   <script src="https://bugout-api.managedplatform.com/launcher.iife.js" defer></script>
//
// The launcher registers itself with window.__ManagedLauncher__ so that if the
// old Bug Out widget.iife.js is also present (during migration) the two won't
// fight over the orb host slot.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import UnifiedPanel from './unified/UnifiedPanel';
import { getOrCreateRegistry } from './launcher/LauncherRegistry';
import type { PanelTab, UnifiedLauncherConfig } from './unified/types';

// ---------------------------------------------------------------------------
// Global shape
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    __MANAGED_LAUNCHER_CONFIG__?: UnifiedLauncherConfig;
    ManagedLauncher?: {
      mount:   (config: UnifiedLauncherConfig) => void;
      unmount: () => void;
      open:    (tab?: PanelTab) => void;
      close:   () => void;
      setUser: (email: string, name: string) => void;
    };
  }
}

const ROOT_ID  = 'managed-launcher-root';
const FONT     = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const LS_KEY   = 'mpl_pos_override';
const DEFAULT_ACCENT = '#6366f1';

// ---------------------------------------------------------------------------
// Styles injected once
// ---------------------------------------------------------------------------
function injectStyles() {
  if (document.getElementById('__ml-launcher-styles__')) return;
  const s = document.createElement('style');
  s.id = '__ml-launcher-styles__';
  s.textContent = `
    @keyframes ml-spin    { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
    @keyframes ml-core    { 0%,100%{ transform:scale(1); opacity:.92; } 50%{ transform:scale(1.06); opacity:1; } }
    @keyframes ml-halo    { 0%,100%{ opacity:.85; } 50%{ opacity:1; } }
    @keyframes ml-panel-in{
      from { opacity:0; transform: translateY(12px) scale(.97); }
      to   { opacity:1; transform: none; }
    }
    @keyframes ml-badge-pop { 0%{ transform:scale(.5); } 60%{ transform:scale(1.25); } 100%{ transform:scale(1); } }
    .ml-cw  { transform-origin:50% 50%; animation: ml-spin 18s linear infinite; }
    .ml-ccw { transform-origin:50% 50%; animation: ml-spin 18s linear infinite reverse; }
    .ml-halo-anim  { animation: ml-halo 4s ease-in-out infinite; transform-origin:50% 50%; }
    .ml-core-anim  { transform-origin:50% 50%; animation: ml-core 4s ease-in-out infinite; }
    .ml-orb-wrap { position: relative; }
    .ml-flip-btn {
      position: absolute;
      top: -26px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15,23,42,0.85);
      border: 1px solid rgba(148,163,184,0.25);
      border-radius: 20px;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms;
      font-family: ${FONT};
    }
    .ml-orb-wrap:hover .ml-flip-btn {
      opacity: 1;
      pointer-events: auto;
    }
    @media (prefers-reduced-motion: reduce) {
      .ml-cw,.ml-ccw,.ml-halo-anim,.ml-core-anim { animation:none !important; }
    }
  `;
  document.head.appendChild(s);
}

// ---------------------------------------------------------------------------
// Darken a hex color by mixing toward black (simple version)
// ---------------------------------------------------------------------------
function darkenHex(hex: string, amount = 0.35): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Orb — floating button with unread badge + flip button
// ---------------------------------------------------------------------------
interface OrbProps {
  open: boolean;
  unread: number;
  onClick: () => void;
  effectivePosition: 'bottom-right' | 'bottom-left';
  accentColor: string;
  onFlip: () => void;
}

function Orb({ open, unread, onClick, effectivePosition, accentColor, onFlip }: OrbProps) {
  const PX = 52;
  const posStyle: React.CSSProperties =
    effectivePosition === 'bottom-left'
      ? { position: 'fixed', bottom: 20, left: 20, right: 'auto' }
      : { position: 'fixed', bottom: 20, right: 20, left: 'auto' };

  const uid = useRef(`ml-${Math.random().toString(36).slice(2, 7)}`).current;
  const darker = darkenHex(accentColor, 0.4);

  const glowNormal = `drop-shadow(0 0 6px ${accentColor}88) drop-shadow(0 0 18px ${accentColor}55)`;
  const glowHover  = `drop-shadow(0 0 8px ${accentColor}aa) drop-shadow(0 0 26px ${accentColor}77)`;

  return (
    <div style={{ ...posStyle, zIndex: 999999 }} className="ml-orb-wrap">
      {/* Flip button — visible on hover via CSS */}
      <button
        type="button"
        className="ml-flip-btn"
        onClick={e => { e.stopPropagation(); onFlip(); }}
        aria-label="Move launcher to other side"
      >
        ⇄
      </button>

      <button
        type="button"
        onClick={onClick}
        aria-label={open ? 'Close Managed Platform' : 'Open Managed Platform'}
        style={{
          position: 'relative',
          width: PX,
          height: PX,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          outline: 'none',
          filter: glowNormal,
          transition: 'filter 200ms, transform 150ms',
          transform: open ? 'scale(0.93)' : 'scale(1)',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.filter = glowHover)}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.filter = glowNormal)}
      >
        <svg viewBox="0 0 100 100" width={PX} height={PX} aria-hidden>
          <defs>
            <radialGradient id={`${uid}-c`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={accentColor} stopOpacity="1" />
              <stop offset="60%"  stopColor={accentColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor={darker}      stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-i`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#e0e7ff"     stopOpacity="0.95" />
              <stop offset="45%"  stopColor={accentColor} stopOpacity="0.65" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="48" fill={`url(#${uid}-c)`} className="ml-halo-anim" />
          <g className="ml-cw">
            <circle cx="50" cy="50" r="43" fill="none" stroke="#8b5cf6" strokeOpacity="0.5" strokeWidth="0.5" />
            {Array.from({ length: 36 }).map((_, i) => {
              const a = (i * 10 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={50 + Math.cos(a) * 40} y1={50 + Math.sin(a) * 40}
                  x2={50 + Math.cos(a) * 43} y2={50 + Math.sin(a) * 43}
                  stroke="#8b5cf6"
                  strokeOpacity={i % 3 === 0 ? 0.8 : 0.3}
                  strokeWidth="0.8"
                />
              );
            })}
          </g>
          <g className="ml-ccw">
            <circle cx="50" cy="50" r="35" fill="none" stroke="#8b5cf6" strokeOpacity="0.8"
              strokeWidth="1.4" strokeDasharray="40 28 16 34" strokeLinecap="round" />
          </g>
          <circle cx="50" cy="50" r="20" fill={`url(#${uid}-i)`} className="ml-core-anim" />
          {/* 3×3 dot grid mark */}
          {([ [-6,-6],[0,-6],[6,-6], [-6,0],[0,0],[6,0], [-6,6],[0,6],[6,6] ] as [number,number][]).map(([dx,dy],i) => (
            <circle key={i} cx={50+dx} cy={50+dy} r="1.4" fill="#e0e7ff" fillOpacity="0.7" />
          ))}
        </svg>

        {/* Unread badge — always red, not brand-colored */}
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              fontFamily: FONT,
              border: '2px solid #0f172a',
              animation: 'ml-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
              lineHeight: 1,
            }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root app component — owns open/unread/position state
// ---------------------------------------------------------------------------
interface AppProps {
  config: UnifiedLauncherConfig;
  openSignal:  React.MutableRefObject<((tab?: PanelTab) => void) | null>;
  closeSignal: React.MutableRefObject<(() => void) | null>;
}

function LauncherApp({ config, openSignal, closeSignal }: AppProps) {
  const [panelOpen,  setPanelOpen]  = useState(false);
  const [initialTab, setInitialTab] = useState<PanelTab>('messages');
  const [unread,     setUnread]     = useState(0);

  const accentColor = config.accentColor ?? DEFAULT_ACCENT;

  // ---- Position with localStorage persistence ----
  const [effectivePosition, setEffectivePosition] = useState<'bottom-right' | 'bottom-left'>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === 'left')  return 'bottom-left';
      if (stored === 'right') return 'bottom-right';
    } catch { /* ignore */ }
    return config.position ?? 'bottom-right';
  });

  const handleFlip = useCallback(() => {
    setEffectivePosition(prev => {
      const next = prev === 'bottom-right' ? 'bottom-left' : 'bottom-right';
      try { localStorage.setItem(LS_KEY, next === 'bottom-left' ? 'left' : 'right'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const open  = useCallback((tab?: PanelTab) => {
    if (tab) setInitialTab(tab);
    setPanelOpen(true);
  }, []);
  const close = useCallback(() => setPanelOpen(false), []);

  // Expose imperative API to the IIFE layer
  useEffect(() => {
    openSignal.current  = open;
    closeSignal.current = close;
  }, [open, close, openSignal, closeSignal]);

  return (
    <>
      <Orb
        open={panelOpen}
        unread={unread}
        onClick={() => (panelOpen ? close() : open())}
        effectivePosition={effectivePosition}
        accentColor={accentColor}
        onFlip={handleFlip}
      />
      {panelOpen && (
        <UnifiedPanel
          config={config}
          initialTab={initialTab}
          onClose={close}
          onUnreadChange={setUnread}
          position={effectivePosition}
          accentColor={accentColor}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mount / unmount
// ---------------------------------------------------------------------------
let root: Root | null = null;
let currentConfig: UnifiedLauncherConfig | null = null;
const openSignal:  React.MutableRefObject<((tab?: PanelTab) => void) | null> = { current: null };
const closeSignal: React.MutableRefObject<(() => void) | null>               = { current: null };

function getOrCreateContainer(): HTMLDivElement {
  let el = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

function mount(config: UnifiedLauncherConfig) {
  injectStyles();
  currentConfig = config;

  // Register with the launcher registry so any surviving old Bug Out orb
  // knows to tear down (revokeHost).
  const registry = getOrCreateRegistry();
  registry.claimHost('managed-launcher', () => {/* we are the highest-priority host */});

  const container = getOrCreateContainer();
  if (!root) root = createRoot(container);
  root.render(
    <LauncherApp config={config} openSignal={openSignal} closeSignal={closeSignal} />,
  );
}

function unmount() {
  const registry = getOrCreateRegistry();
  registry.releaseHost('managed-launcher');
  if (root) { root.unmount(); root = null; }
  document.getElementById(ROOT_ID)?.remove();
}

window.ManagedLauncher = {
  mount,
  unmount,
  open:  (tab?) => openSignal.current?.(tab),
  close: ()     => closeSignal.current?.(),
  setUser: (email, name) => {
    if (!currentConfig) return;
    mount({ ...currentConfig, user: { email, name } });
  },
};

// Auto-mount from page config
function autoMount() {
  const cfg = window.__MANAGED_LAUNCHER_CONFIG__;
  if (cfg?.bugout?.apiKey && cfg?.comms?.apiKey) {
    mount(cfg);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}
