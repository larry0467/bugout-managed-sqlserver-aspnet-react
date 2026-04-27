import React, { useEffect, useState, useCallback } from 'react';
import { Button, message, Tooltip } from 'antd';
import { ReloadOutlined, ExperimentOutlined } from '@ant-design/icons';
import {
  systemApi,
  sandboxApi,
  type SystemCapabilities,
  type SandboxStatus,
  type AuthUser,
} from '../api';

interface SandboxBannerProps {
  // Owner-only "Reset Now" button. Pass null to render in a logged-out
  // state (capabilities is anonymous, so the banner shows pre-login too).
  user: AuthUser | null;
}

// Renders a sticky top banner ONLY when /api/system/capabilities reports
// sandboxMode === true. In dev/beta/prod the endpoint returns false and
// this component is invisible, so it's safe to mount unconditionally at
// the app root.
//
// Polls /admin/sandbox/status every 60s to keep "Last reset" fresh
// without a websocket — the recurring job runs once a day, so a minute of
// staleness is fine. Polling skipped when the user isn't a PLATFORM_OWNER
// (status endpoint is owner-gated).
const SandboxBanner: React.FC<SandboxBannerProps> = ({ user }) => {
  const [caps, setCaps] = useState<SystemCapabilities | null>(null);
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [resetting, setResetting] = useState(false);

  const isOwner = user?.role === 'PLATFORM_OWNER';

  const loadCaps = useCallback(async () => {
    try {
      setCaps(await systemApi.capabilities());
    } catch {
      // Silent — banner just stays hidden if the endpoint is unreachable.
      // No reason to red-flag the whole admin UI for a feature-flag call.
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!isOwner) return;
    try {
      setStatus(await sandboxApi.status());
    } catch {
      // Same rationale as above.
    }
  }, [isOwner]);

  useEffect(() => {
    loadCaps();
  }, [loadCaps]);

  useEffect(() => {
    if (!caps?.sandboxMode || !isOwner) return;
    loadStatus();
    const id = window.setInterval(loadStatus, 60_000);
    return () => window.clearInterval(id);
  }, [caps?.sandboxMode, isOwner, loadStatus]);

  if (!caps?.sandboxMode) return null;

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await sandboxApi.reset();
      message.success(`Sandbox reset: ${result.bugsInserted} bugs, ${result.usersInserted} users.`);
      await loadStatus();
    } catch (err: any) {
      message.error(err?.response?.data?.message ?? 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: 'linear-gradient(90deg, #ff9800, #ff5722)',
        color: '#0a0a0a',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontSize: 13,
        fontWeight: 600,
        borderBottom: '1px solid rgba(0,0,0,0.15)',
      }}
    >
      <ExperimentOutlined style={{ fontSize: 16 }} />
      <span>SANDBOX</span>
      <span style={{ opacity: 0.85, fontWeight: 400 }}>
        data resets nightly at midnight CT
      </span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>·</span>
      <span style={{ opacity: 0.85, fontWeight: 400 }}>
        Last reset: {formatTimeAgo(status?.lastResetAt)}
      </span>
      {isOwner && (
        <Tooltip title="Truncate Acme Plumbing data and re-seed now (owner only)">
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={resetting}
            onClick={handleReset}
            style={{
              background: 'rgba(0,0,0,0.85)',
              color: '#ff9800',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Reset Now
          </Button>
        </Tooltip>
      )}
    </div>
  );
};

// Cheap relative formatter — avoids pulling in dayjs just for the banner.
function formatTimeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  if (Number.isNaN(diffMs) || diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default SandboxBanner;
