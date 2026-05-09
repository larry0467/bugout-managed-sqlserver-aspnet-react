import React, { useCallback, useState } from 'react';
import MessagesTab from './tabs/MessagesTab';
import BugTab from './tabs/BugTab';
import type { PanelSize, PanelTab, UnifiedLauncherConfig } from './types';

// ---------------------------------------------------------------------------
// Panel dimensions per size mode
// ---------------------------------------------------------------------------
const DIMS: Record<PanelSize, { width: number; height: number } | null> = {
  mini:       { width: 380, height: 420 },
  large:      { width: 500, height: 620 },
  fullscreen: null,   // position: fixed; inset: 0
};

const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

interface Props {
  config: UnifiedLauncherConfig;
  initialTab?: PanelTab;
  onClose: () => void;
  onUnreadChange: (n: number) => void;
  position: 'bottom-right' | 'bottom-left';
}

// ---------------------------------------------------------------------------
// SizeButton
// ---------------------------------------------------------------------------
function SizeBtn({
  label,
  active,
  onClick,
  isDark,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        background: active ? '#6366f1' : 'transparent',
        border: `1px solid ${active ? '#6366f1' : isDark ? '#334155' : '#cbd5e1'}`,
        borderRadius: 6,
        color: active ? '#fff' : isDark ? '#94a3b8' : '#64748b',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: FONT,
        padding: '2px 7px',
        lineHeight: 1.6,
        transition: 'all 120ms',
      }}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// UnifiedPanel
// ---------------------------------------------------------------------------
export default function UnifiedPanel({
  config,
  initialTab = 'messages',
  onClose,
  onUnreadChange,
  position,
}: Props) {
  const [tab, setTab]   = useState<PanelTab>(initialTab);
  const [size, setSize] = useState<PanelSize>('mini');

  const isDark = config.theme !== 'light';
  const dims   = DIMS[size];

  // Placement — anchored to orb corner
  const anchorStyle: React.CSSProperties =
    size === 'fullscreen'
      ? { position: 'fixed', inset: 0, borderRadius: 0 }
      : position === 'bottom-left'
        ? { position: 'fixed', bottom: 88, left: 24, borderRadius: 16 }
        : { position: 'fixed', bottom: 88, right: 24, borderRadius: 16 };

  const bg      = isDark ? '#0f172a' : '#ffffff';
  const border  = isDark ? '#1e293b' : '#e2e8f0';
  const heading = isDark ? '#f1f5f9' : '#0f172a';
  const sub     = isDark ? '#475569' : '#94a3b8';

  const handleUnread = useCallback(onUnreadChange, [onUnreadChange]);

  return (
    <div
      style={{
        ...anchorStyle,
        width:  dims ? dims.width  : undefined,
        height: dims ? dims.height : undefined,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 999999,
        fontFamily: FONT,
        // Animate in
        animation: 'ml-panel-in 0.18s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* Header                                                              */}
      {/* ----------------------------------------------------------------- */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: `1px solid ${border}`,
          background: isDark ? '#0a0f1e' : '#f8fafc',
          flexShrink: 0,
        }}
      >
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setTab('messages')}
            style={{
              background: tab === 'messages' ? '#6366f1' : 'transparent',
              color: tab === 'messages' ? '#fff' : isDark ? '#94a3b8' : '#64748b',
              border: 'none',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            💬 Messages
          </button>
          <button
            onClick={() => setTab('bug')}
            style={{
              background: tab === 'bug' ? '#6366f1' : 'transparent',
              color: tab === 'bug' ? '#fff' : isDark ? '#94a3b8' : '#64748b',
              border: 'none',
              borderRadius: 8,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: FONT,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            🐛 Report
          </button>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Size controls */}
          <SizeBtn label="–"  active={size === 'mini'}       onClick={() => setSize('mini')}       isDark={isDark} />
          <SizeBtn label="▪"  active={size === 'large'}      onClick={() => setSize('large')}      isDark={isDark} />
          <SizeBtn label="⛶"  active={size === 'fullscreen'} onClick={() => setSize('fullscreen')} isDark={isDark} />

          {/* Close */}
          <button
            onClick={onClose}
            title="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: sub,
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 2px',
              marginLeft: 4,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Body                                                                */}
      {/* ----------------------------------------------------------------- */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'messages' ? (
          <MessagesTab
            commsConfig={config.comms}
            user={config.user}
            entityId={config.entityId}
            size={size}
            theme={config.theme ?? 'dark'}
            onUnreadChange={handleUnread}
          />
        ) : (
          <BugTab
            bugoutConfig={config.bugout}
            user={config.user}
            size={size}
            theme={config.theme ?? 'dark'}
            tenantId={config.tenantId}
            tenantName={config.tenantName}
            appVersion={config.appVersion}
            environment={config.environment}
          />
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Footer brand strip                                                  */}
      {/* ----------------------------------------------------------------- */}
      <div
        style={{
          padding: '4px 12px',
          borderTop: `1px solid ${border}`,
          fontSize: 10,
          color: isDark ? '#1e293b' : '#e2e8f0',
          background: isDark ? '#060c1a' : '#f8fafc',
          textAlign: 'center',
          letterSpacing: '0.08em',
          flexShrink: 0,
          fontWeight: 600,
        }}
      >
        MANAGED PLATFORM
      </div>
    </div>
  );
}
