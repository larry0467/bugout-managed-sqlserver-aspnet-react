import React, { useEffect, useRef, useState } from 'react';
import { Steps, Button, Space, Modal, Select, Typography, Tag, Input, message, Spin } from 'antd';
import {
  ArrowUpOutlined,
  UserOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  SendOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import {
  ticketApi,
  teamApi,
  type ClaudeRun,
  type Ticket,
  type AuthUser,
  type ClaudeModel,
  type DeveloperOption,
  type EscalationStage,
} from '../api';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface EscalationPanelProps {
  ticket: Ticket;
  currentUser: AuthUser;
  onChanged: () => void; // refresh ticket
  onAssignedToClaude: () => void; // switch to Claude Activity tab
}

// 6-step flow.
const stageIndex = (stage?: EscalationStage | string): number => {
  switch (stage) {
    case 'SUPER_ADMIN_REVIEW':
      return 1;
    case 'PLATFORM_OWNER_REVIEW':
      return 2;
    case 'ASSIGNED_HUMAN':
    case 'ASSIGNED_CLAUDE':
      return 3;
    case 'OWNER_APPROVAL_PENDING':
      return 4;
    case 'COMPLETED':
      return 5;
    case 'NONE':
    default:
      return 0;
  }
};

// Format ms duration as "2h 14m" or "32m" or "45s".
const formatDur = (ms: number): string => {
  if (!isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) {
    const s = Math.max(1, Math.floor(ms / 1000));
    return `${s}s`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const ts = (s?: string | null): number | null => {
  if (!s) return null;
  const v = new Date(s).getTime();
  return isNaN(v) ? null : v;
};

interface StageBadge {
  label: string;
  durationMs: number | null; // null = not yet entered
  running: boolean;
}

// Compute the timing breakdown for the stage badges row.
const computeStageBadges = (ticket: Ticket): StageBadge[] => {
  const now = Date.now();
  const stage = ticket.escalationStage || 'NONE';

  const created = ts(ticket.createdAt);
  const escToOwner = ts(ticket.escalatedToOwnerAt);
  const assigned = ts(ticket.assignedAt);
  const submittedApproval = ts(ticket.submittedForApprovalAt);
  const approved = ts(ticket.approvedAt);

  // Triage: createdAt -> escalatedToOwnerAt (or now if still pending)
  // "Currently in triage" stages are NONE or SUPER_ADMIN_REVIEW.
  const inTriage = stage === 'NONE' || stage === 'SUPER_ADMIN_REVIEW';
  const triageEnd = escToOwner ?? (inTriage ? now : null);
  const triageMs = created != null && triageEnd != null ? triageEnd - created : null;

  // Owner queue: escalatedToOwnerAt -> assignedAt
  const inOwnerQueue = stage === 'PLATFORM_OWNER_REVIEW';
  const ownerQueueEnd = assigned ?? (inOwnerQueue ? now : null);
  const ownerQueueMs =
    escToOwner != null && ownerQueueEnd != null ? ownerQueueEnd - escToOwner : null;

  // Dev work: assignedAt -> submittedForApprovalAt (or now)
  // For Claude tickets without a submit, defer to claudeRuns (which we don't fetch here);
  // we fall back to "running while ASSIGNED_CLAUDE" so the UI still pulses.
  const inDevWork = stage === 'ASSIGNED_HUMAN' || stage === 'ASSIGNED_CLAUDE';
  const devWorkEnd = submittedApproval ?? (inDevWork ? now : null);
  const devWorkMs =
    assigned != null && devWorkEnd != null ? devWorkEnd - assigned : null;

  // Owner approval: submittedForApprovalAt -> approvedAt (or now)
  const inOwnerApproval = stage === 'OWNER_APPROVAL_PENDING';
  const approvalEnd = approved ?? (inOwnerApproval ? now : null);
  const approvalMs =
    submittedApproval != null && approvalEnd != null ? approvalEnd - submittedApproval : null;

  // Total: createdAt -> approvedAt (or now)
  const totalEnd = approved ?? now;
  const totalMs = created != null ? totalEnd - created : null;

  return [
    { label: 'Triage', durationMs: triageMs, running: inTriage },
    { label: 'Owner queue', durationMs: ownerQueueMs, running: inOwnerQueue },
    { label: 'Dev work', durationMs: devWorkMs, running: inDevWork },
    { label: 'Owner approval', durationMs: approvalMs, running: inOwnerApproval },
    { label: 'Total', durationMs: totalMs, running: stage !== 'COMPLETED' },
  ];
};

const StageBadgeRow: React.FC<{ ticket: Ticket }> = ({ ticket }) => {
  // Re-render every 30s while the ticket is in flight so "running" durations tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ticket.escalationStage === 'COMPLETED') return;
    const id = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(id);
  }, [ticket.escalationStage]);

  const badges = computeStageBadges(ticket);

  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 4,
        fontSize: 12,
        color: '#9aa0a6',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignItems: 'center',
      }}
    >
      {badges.map((b, i) => {
        const dim = b.durationMs == null;
        const isTotal = b.label === 'Total';
        const color = dim ? '#5a6068' : b.running ? '#26c6da' : isTotal ? '#cfd8dc' : '#aab2bd';
        const value = dim ? '—' : formatDur(b.durationMs!);
        return (
          <React.Fragment key={b.label}>
            {i > 0 && <span style={{ color: '#3a3f48' }}> · </span>}
            <span
              style={{
                color,
                fontWeight: isTotal ? 600 : 400,
                animation: b.running && !dim ? 'bom-pulse 2s ease-in-out infinite' : undefined,
              }}
            >
              {b.label} {value}
            </span>
          </React.Fragment>
        );
      })}
      {/* Inline keyframes — keeps this self-contained without touching globals. */}
      <style>{`@keyframes bom-pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }`}</style>
    </div>
  );
};

const EscalationPanel: React.FC<EscalationPanelProps> = ({
  ticket,
  currentUser,
  onChanged,
  onAssignedToClaude,
}) => {
  const [escalating, setEscalating] = useState(false);
  const [humanModalOpen, setHumanModalOpen] = useState(false);
  const [humanLoading, setHumanLoading] = useState(false);
  const [developers, setDevelopers] = useState<DeveloperOption[]>([]);
  const [selectedDev, setSelectedDev] = useState<number | null>(null);
  const [claudeModalOpen, setClaudeModalOpen] = useState(false);
  const [claudeLoading, setClaudeLoading] = useState<ClaudeModel | null>(null);

  // New approval-loop UI state
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestChangesReason, setRequestChangesReason] = useState('');
  const [requestChangesLoading, setRequestChangesLoading] = useState(false);

  const stage = (ticket.escalationStage || 'NONE') as EscalationStage;
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  const isPlatformOwner = currentUser.role === 'PLATFORM_OWNER';
  const isDeveloper = currentUser.role === 'DEVELOPER';

  // In-flight stage label for the "In progress" step (step index 3).
  const inProgressLabel =
    stage === 'ASSIGNED_HUMAN'
      ? `Assigned to ${ticket.assignedTo || 'developer'}`
      : stage === 'ASSIGNED_CLAUDE'
        ? 'Claude working'
        : 'In progress';

  // Poll the ticket every 10s while in approval-pending so the owner sees state changes live.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  useEffect(() => {
    if (stage !== 'OWNER_APPROVAL_PENDING') return;
    const id = window.setInterval(() => onChangedRef.current(), 10000);
    return () => window.clearInterval(id);
  }, [stage]);

  const handleEscalateToOwner = async () => {
    setEscalating(true);
    try {
      await ticketApi.escalateToPlatformOwner(ticket.id);
      message.success('Escalated to platform owner');
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to escalate');
    } finally {
      setEscalating(false);
    }
  };

  const openHumanModal = async () => {
    setHumanModalOpen(true);
    setSelectedDev(null);
    try {
      const list = await teamApi.developers(ticket.developerCategory);
      setDevelopers(list);
    } catch {
      setDevelopers([]);
    }
  };

  const handleAssignHuman = async () => {
    if (selectedDev == null) {
      message.warning('Pick a developer');
      return;
    }
    const dev = developers.find((d) => d.id === selectedDev);
    if (!dev) return;
    setHumanLoading(true);
    try {
      await ticketApi.assignToHuman(ticket.id, dev.id, dev.email);
      message.success(`Assigned to ${dev.fullName}`);
      setHumanModalOpen(false);
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to assign');
    } finally {
      setHumanLoading(false);
    }
  };

  const handleAssignClaude = async (model: ClaudeModel) => {
    setClaudeLoading(model);
    try {
      await ticketApi.assignToClaude(ticket.id, model);
      message.success(`Claude (${model}) is now investigating`);
      setClaudeModalOpen(false);
      onChanged();
      onAssignedToClaude();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to start Claude run');
    } finally {
      setClaudeLoading(null);
    }
  };

  const [cancelClaudeLoading, setCancelClaudeLoading] = useState(false);
  const [markReadyLoading, setMarkReadyLoading] = useState(false);
  // Live status of the most recent Claude run on this ticket. Polled every
  // 5s while stage=ASSIGNED_CLAUDE so the operator sees the run advancing
  // (or hung) without changing tabs. Polling stops when the run reaches a
  // terminal state.
  const [latestRun, setLatestRun] = useState<ClaudeRun | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const runPollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (stage !== 'ASSIGNED_CLAUDE') {
      setLatestRun(null);
      return;
    }
    let cancelled = false;
    const fetchLatest = async () => {
      try {
        const runs = await ticketApi.claudeRuns(ticket.id);
        if (cancelled) return;
        const next = runs[0] ?? null;
        setLatestRun(next);
        // Once the latest run is in a terminal state, kill the per-second
        // tick — leaving it alive caused the elapsed counter to keep
        // advancing past completion when the API payload was missing
        // updatedAt/durationMs (the freeze fallbacks both bottomed out
        // at nowMs).
        if (next && next.status !== 'PENDING' && next.status !== 'RUNNING' && tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
      } catch {
        // swallow; UI just stays on previous snapshot
      }
    };
    fetchLatest();
    runPollRef.current = window.setInterval(fetchLatest, 5000);
    // Tick once a second so the elapsed counter updates smoothly.
    tickRef.current = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      if (runPollRef.current) window.clearInterval(runPollRef.current);
      if (tickRef.current) window.clearInterval(tickRef.current);
      runPollRef.current = null;
      tickRef.current = null;
    };
  }, [stage, ticket.id]);

  const handleCancelClaude = (force = false) => {
    const runStatus = latestRun?.status ?? 'unknown';
    const isInFlight = runStatus === 'RUNNING' || runStatus === 'PENDING';
    Modal.confirm({
      title: force
        ? 'Force-cancel a running Claude assignment?'
        : 'Cancel current Claude assignment?',
      content: force ? (
        <div>
          <p>
            The latest run is in <strong>{runStatus}</strong>. Force-cancelling
            marks it failed in our database and frees the ticket for re-assignment{' '}
            <strong>immediately</strong>. The sidecar's actual agent process keeps
            running until it finishes naturally (or hits its 30-minute budget cap)
            — its eventual output is logged but ignored. Use this if you suspect
            the run is stuck.
          </p>
        </div>
      ) : (
        'This puts the ticket back in Platform-owner review so you can reassign. Used after a failed run.'
      ),
      okText: force ? 'Force cancel' : 'Cancel & re-assign',
      okButtonProps: force ? { danger: true } : undefined,
      cancelText: 'Keep assigned',
      onOk: async () => {
        setCancelClaudeLoading(true);
        try {
          await ticketApi.cancelClaudeAssignment(ticket.id, force);
          message.success(
            force
              ? 'Run force-cancelled — ticket back in platform-owner review'
              : 'Ticket back in platform-owner review',
          );
          onChanged();
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Failed to cancel');
        } finally {
          setCancelClaudeLoading(false);
        }
      },
    });
    // Touch isInFlight so eslint doesn't complain that we read it for the
    // copy decision elsewhere.
    void isInFlight;
  };

  const handleMarkClaudeReady = async () => {
    setMarkReadyLoading(true);
    try {
      await ticketApi.claudeMarkReady(ticket.id);
      message.success('Marked ready for review — test the change in dev to approve.');
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to mark ready');
    } finally {
      setMarkReadyLoading(false);
    }
  };

  const handleSubmitForApproval = () => {
    Modal.confirm({
      title: 'Submit this ticket for owner approval?',
      content:
        'The platform owner will review your work and either approve & ship, or request changes.',
      okText: 'Submit',
      onOk: async () => {
        setSubmittingApproval(true);
        try {
          await ticketApi.submitForApproval(ticket.id);
          message.success('Submitted for owner approval');
          onChanged();
        } catch (err: any) {
          message.error(err.response?.data?.error || 'Failed to submit for approval');
        } finally {
          setSubmittingApproval(false);
        }
      },
    });
  };

  const handleApprove = () => {
    Modal.confirm({
      title: 'Mark this ticket as completed and ship to dev?',
      content:
        'This finalizes the ticket. The dev will get notified that their work was approved.',
      okText: 'Approve & ship',
      onOk: async () => {
        setApproving(true);
        try {
          await ticketApi.approve(ticket.id);
          message.success('Ticket approved and marked completed');
          onChanged();
        } catch (err: any) {
          message.error(err.response?.data?.error || 'Failed to approve');
        } finally {
          setApproving(false);
        }
      },
    });
  };

  const submitChanges = async () => {
    const reason = requestChangesReason.trim();
    if (reason.length < 10) {
      message.warning('Please describe the requested changes (min 10 characters).');
      return;
    }
    if (reason.length > 2000) {
      message.warning('Reason is too long (max 2000 characters).');
      return;
    }
    setRequestChangesLoading(true);
    try {
      await ticketApi.requestChanges(ticket.id, reason);
      message.success('Changes requested — sent back to developer');
      setRequestChangesOpen(false);
      setRequestChangesReason('');
      onChanged();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to request changes');
    } finally {
      setRequestChangesLoading(false);
    }
  };

  const showSuperAdminButton = isSuperAdmin && stage === 'SUPER_ADMIN_REVIEW';
  const showOwnerAssignButtons = isPlatformOwner && stage === 'PLATFORM_OWNER_REVIEW';
  const showOwnerApprovalButtons = isPlatformOwner && stage === 'OWNER_APPROVAL_PENDING';
  // PLATFORM_OWNER can punt a stuck Claude assignment back to review when
  // the latest run failed (sidecar bug, GitHub auth, etc.). Server enforces
  // the "latest run must be FAILED" rule — UI shows the button whenever
  // the ticket is in ASSIGNED_CLAUDE and surfaces the server's 409 message
  // verbatim if a RUNNING run can't be cancelled.
  const showCancelClaudeButton = isPlatformOwner && stage === 'ASSIGNED_CLAUDE';
  const isAssigned = stage === 'ASSIGNED_HUMAN' || stage === 'ASSIGNED_CLAUDE';

  // Devs only get the "Submit for approval" button on tickets actually assigned to them.
  const isAssignedToMe =
    !!ticket.assignedTo &&
    !!currentUser.email &&
    ticket.assignedTo.toLowerCase() === currentUser.email.toLowerCase();
  const showDevSubmit = isDeveloper && stage === 'ASSIGNED_HUMAN';

  const revisionCount = ticket.revisionCount || 0;

  // Live banner for an in-flight Claude run — visible without leaving the
  // main ticket detail. Updates the elapsed timer once a second while
  // running; freezes at completion time once the run hits a terminal
  // state.
  const renderClaudeBanner = () => {
    if (stage !== 'ASSIGNED_CLAUDE' || !latestRun) return null;
    const status = latestRun.status;
    // C# DateTime.Kind=Unspecified serializes without a Z suffix; browsers
    // would otherwise parse as local time and elapsed clamps to 00:00.
    const parseUtc = (s: string | Date): number => {
      if (typeof s !== 'string') return new Date(s).getTime();
      const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
      return new Date(hasTz ? s : s + 'Z').getTime();
    };
    const startedMs = parseUtc(latestRun.createdAt);
    const isInFlight = status === 'RUNNING' || status === 'PENDING';
    const isCancelled = status === 'CANCELLED';
    const isError = status === 'FAILED' || status === 'CAPPED';
    // For terminal runs, freeze elapsed at the run's UpdatedAt so we
    // surface "this is how long it took to terminate" rather than
    // ticking forever in a static UI. If the API payload is missing
    // updatedAt AND durationMs, anchor to startedMs (elapsed=0) instead
    // of nowMs — falling back to nowMs caused the bug where a SUCCEEDED
    // run kept ticking past completion alongside a "Claude finished"
    // banner.
    const endMs = isInFlight
      ? nowMs
      : latestRun.updatedAt
        ? parseUtc(latestRun.updatedAt)
        : (latestRun.durationMs ? startedMs + latestRun.durationMs : startedMs);
    const elapsedSec = Math.max(0, Math.floor((endMs - startedMs) / 1000));
    const mm = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
    const ss = (elapsedSec % 60).toString().padStart(2, '0');
    const bg = isInFlight
      ? 'linear-gradient(90deg, rgba(76,175,80,0.18), rgba(76,175,80,0.06))'
      : isError
        ? 'linear-gradient(90deg, rgba(229,57,53,0.20), rgba(229,57,53,0.06))'
        : isCancelled
          ? 'linear-gradient(90deg, rgba(255,152,0,0.20), rgba(255,152,0,0.06))'
          : 'linear-gradient(90deg, rgba(76,175,80,0.20), rgba(76,175,80,0.06))';
    const border = isInFlight
      ? '1px solid rgba(76,175,80,0.45)'
      : isError
        ? '1px solid rgba(229,57,53,0.45)'
        : isCancelled
          ? '1px solid rgba(255,152,0,0.45)'
          : '1px solid rgba(76,175,80,0.45)';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          marginBottom: 12,
          borderRadius: 8,
          background: bg,
          border,
        }}
      >
        {isInFlight && <Spin size="small" />}
        <RobotOutlined style={{ fontSize: 18 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {isInFlight && `Claude is investigating (${String(latestRun.model).toUpperCase()})`}
            {status === 'SUCCEEDED' && `Claude finished — PR ready for review`}
            {isError && `Claude run ${status.toLowerCase()}`}
            {isCancelled && `Claude run cancelled — agent may still be running in the background`}
          </div>
          <div style={{ fontSize: 11, opacity: 0.75 }}>
            Run #{latestRun.id} · started {new Date(startedMs).toLocaleTimeString()} · elapsed {mm}:{ss}
            {!isInFlight && latestRun.errorMessage && (
              <> · <Text type="danger">{latestRun.errorMessage.slice(0, 120)}{latestRun.errorMessage.length > 120 ? '…' : ''}</Text></>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '8px 4px 16px' }}>
      {renderClaudeBanner()}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <div style={{ flex: 1, minWidth: 480 }}>
          <Steps
            size="small"
            current={stageIndex(stage)}
            status={stage === 'COMPLETED' ? 'finish' : 'process'}
            items={[
              { title: 'Submitted' },
              { title: 'Super-admin review' },
              { title: 'Platform-owner review' },
              { title: stageIndex(stage) === 3 ? inProgressLabel : 'In progress' },
              { title: 'Owner approval' },
              { title: 'Completed' },
            ]}
          />
        </div>
        {revisionCount > 0 && (
          <Tag color="warning" style={{ marginInlineEnd: 0 }}>
            Revision {revisionCount}
          </Tag>
        )}
      </div>

      <StageBadgeRow ticket={ticket} />

      <div style={{ marginTop: 12 }}>
        {showSuperAdminButton && (
          <Button
            type="primary"
            icon={<ArrowUpOutlined />}
            loading={escalating}
            onClick={handleEscalateToOwner}
          >
            Escalate to platform owner
          </Button>
        )}

        {showOwnerAssignButtons && (
          <Space>
            <Button type="primary" icon={<UserOutlined />} onClick={openHumanModal}>
              Assign to human dev
            </Button>
            <Button icon={<RobotOutlined />} onClick={() => setClaudeModalOpen(true)}>
              Assign to Claude
            </Button>
          </Space>
        )}

        {showCancelClaudeButton && (() => {
          const status = latestRun?.status;
          const isInFlight = status === 'RUNNING' || status === 'PENDING';
          const isFailed = status === 'FAILED' || status === 'CAPPED';
          const isReadyButStuck = status === 'SUCCEEDED' && !!latestRun?.prUrl;
          if (isInFlight) {
            return (
              <Button
                danger
                icon={<RobotOutlined />}
                loading={cancelClaudeLoading}
                onClick={() => handleCancelClaude(true)}
              >
                Force-cancel running run & re-assign
              </Button>
            );
          }
          if (isFailed) {
            return (
              <Button
                danger
                icon={<RobotOutlined />}
                loading={cancelClaudeLoading}
                onClick={() => handleCancelClaude(false)}
              >
                Cancel Claude assignment & re-assign
              </Button>
            );
          }
          // Worker auto-flip should have advanced this ticket to
          // OWNER_APPROVAL_PENDING when the SUCCEEDED run carried a PR. If
          // we got here it didn't — surface a manual escape hatch instead
          // of dead-ending the platform owner with no path forward.
          if (isReadyButStuck) {
            return (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={markReadyLoading}
                onClick={handleMarkClaudeReady}
              >
                Mark ready for review
              </Button>
            );
          }
          // Unknown status — render nothing rather than a button that won't help.
          return null;
        })()}

        {showDevSubmit && (
          <Space wrap>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={submittingApproval}
              disabled={!isAssignedToMe}
              onClick={handleSubmitForApproval}
            >
              Submit for approval
            </Button>
            {!isAssignedToMe && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Only the assigned developer ({ticket.assignedTo || 'unknown'}) can submit this ticket.
              </Text>
            )}
          </Space>
        )}

        {showOwnerApprovalButtons && (
          <Space wrap>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={approving}
              onClick={handleApprove}
            >
              Approve & ship
            </Button>
            <Button
              danger
              icon={<RollbackOutlined />}
              onClick={() => setRequestChangesOpen(true)}
            >
              Request changes
            </Button>
            {ticket.submittedForApprovalBy && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Submitted by {ticket.submittedForApprovalBy}
                {ticket.submittedForApprovalAt &&
                  ` at ${new Date(ticket.submittedForApprovalAt).toLocaleString()}`}
              </Text>
            )}
          </Space>
        )}

        {stage === 'COMPLETED' && (
          <Space size={6} wrap>
            <Tag icon={<CheckCircleOutlined />} color="green">
              Completed
            </Tag>
            {ticket.approvedBy && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Approved by {ticket.approvedBy}
                {ticket.approvedAt && ` at ${new Date(ticket.approvedAt).toLocaleString()}`}
              </Text>
            )}
          </Space>
        )}

        {isAssigned && !showDevSubmit && (
          <Space size={6} wrap>
            <Tag
              icon={<CheckCircleOutlined />}
              color={stage === 'ASSIGNED_CLAUDE' ? 'geekblue' : 'green'}
            >
              {stage === 'ASSIGNED_CLAUDE' ? 'Assigned to Claude' : 'Assigned to a developer'}
            </Tag>
            {ticket.assignedTo && <Text type="secondary">{ticket.assignedTo}</Text>}
            {ticket.assignedAt && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {new Date(ticket.assignedAt).toLocaleString()}
              </Text>
            )}
          </Space>
        )}
      </div>

      {/* Assign to human modal */}
      <Modal
        title={`Assign ticket #${ticket.id} to a developer`}
        open={humanModalOpen}
        onOk={handleAssignHuman}
        onCancel={() => setHumanModalOpen(false)}
        okText="Assign"
        confirmLoading={humanLoading}
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {ticket.developerCategory
            ? `Showing developers eligible for category ${ticket.developerCategory}.`
            : 'No developer category set on this ticket — showing all eligible developers.'}
        </Paragraph>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Select a developer"
          value={selectedDev ?? undefined}
          onChange={(v) => setSelectedDev(v)}
          filterOption={(input, option) =>
            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
          }
          options={developers.map((d) => ({
            label: `${d.fullName} (${d.email})${d.specialty ? ` · ${d.specialty}` : ''}`,
            value: d.id,
          }))}
        />
      </Modal>

      {/* Assign to Claude modal */}
      <Modal
        title="Run Claude as your AI developer?"
        open={claudeModalOpen}
        onCancel={() => setClaudeModalOpen(false)}
        footer={[
          <Button
            key="cancel"
            onClick={() => setClaudeModalOpen(false)}
            disabled={claudeLoading != null}
          >
            Cancel
          </Button>,
          <Button
            key="sonnet"
            type="primary"
            loading={claudeLoading === 'sonnet'}
            disabled={claudeLoading != null && claudeLoading !== 'sonnet'}
            onClick={() => handleAssignClaude('sonnet')}
          >
            Run Sonnet
          </Button>,
          <Button
            key="opus"
            type="primary"
            ghost
            loading={claudeLoading === 'opus'}
            disabled={claudeLoading != null && claudeLoading !== 'opus'}
            onClick={() => handleAssignClaude('opus')}
          >
            Run Opus (premium)
          </Button>,
        ]}
      >
        <Paragraph>
          Claude (Sonnet 4.6) will read the ticket transcript, investigate the codebase, and open a PR
          against <Text code>dev</Text> if it can propose a fix.
        </Paragraph>
        <Paragraph>
          <Text strong>Estimated cost:</Text> $3–$15 per run (hard $20 cap). Daily cap of $100 per
          tenant.
        </Paragraph>
      </Modal>

      {/* Request changes modal */}
      <Modal
        title={`Request changes on ticket #${ticket.id}`}
        open={requestChangesOpen}
        onOk={submitChanges}
        onCancel={() => setRequestChangesOpen(false)}
        okText="Send back to dev"
        okButtonProps={{ danger: true }}
        confirmLoading={requestChangesLoading}
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Be specific. The developer will see this as a comment on the ticket.
        </Paragraph>
        <TextArea
          rows={5}
          maxLength={2000}
          showCount
          value={requestChangesReason}
          onChange={(e) => setRequestChangesReason(e.target.value)}
          placeholder="What should the developer change? They'll see this as a comment."
        />
      </Modal>
    </div>
  );
};

export default EscalationPanel;
