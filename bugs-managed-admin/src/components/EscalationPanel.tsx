import React, { useEffect, useRef, useState } from 'react';
import { Steps, Button, Space, Modal, Select, Typography, Tag, Input, message } from 'antd';
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
  const isAssigned = stage === 'ASSIGNED_HUMAN' || stage === 'ASSIGNED_CLAUDE';

  // Devs only get the "Submit for approval" button on tickets actually assigned to them.
  const isAssignedToMe =
    !!ticket.assignedTo &&
    !!currentUser.email &&
    ticket.assignedTo.toLowerCase() === currentUser.email.toLowerCase();
  const showDevSubmit = isDeveloper && stage === 'ASSIGNED_HUMAN';

  const revisionCount = ticket.revisionCount || 0;

  return (
    <div style={{ padding: '8px 4px 16px' }}>
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
