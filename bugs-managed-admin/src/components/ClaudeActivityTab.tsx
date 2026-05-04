import React, { useEffect, useRef, useState } from 'react';
import { Card, Tag, Typography, Spin, Button, Collapse, Empty, Space } from 'antd';
import { LinkOutlined, RobotOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { ticketApi, type ClaudeRun, type ClaudeRunStatus } from '../api';

const { Text, Paragraph } = Typography;

interface ClaudeActivityTabProps {
  ticketId: number;
  active: boolean;
}

const statusColors: Record<ClaudeRunStatus, string> = {
  PENDING: 'default',
  RUNNING: 'processing',
  SUCCEEDED: 'success',
  FAILED: 'error',
  CAPPED: 'warning',
  CANCELLED: 'default',
};

const formatDuration = (ms?: number): string => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// API returns DateTime.Kind=Unspecified which serializes without a Z
// suffix. Browsers then treat the bare ISO as local time even though the
// server stored UTC. Force UTC interpretation when no timezone is
// present so timestamps render correctly across time zones.
const parseApiDate = (s: string | Date): Date => {
  if (s instanceof Date) return s;
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + 'Z');
};

const formatCost = (cost?: number): string => {
  if (cost == null) return '$0.00';
  return `$${cost.toFixed(2)}`;
};

const ClaudeActivityTab: React.FC<ClaudeActivityTabProps> = ({ ticketId, active }) => {
  const [runs, setRuns] = useState<ClaudeRun[] | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await ticketApi.claudeRuns(ticketId);
      setRuns(data);
    } catch {
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ticketId]);

  // Auto-refresh every 10s while any run is PENDING/RUNNING
  useEffect(() => {
    if (!active || !runs) return;
    const inFlight = runs.some((r) => r.status === 'PENDING' || r.status === 'RUNNING');
    if (!inFlight) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      fetchRuns();
    }, 10000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, active, ticketId]);

  if (!active) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong><RobotOutlined /> Claude Activity</Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={fetchRuns} loading={loading}>
          Refresh
        </Button>
      </div>

      {runs == null && loading && (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      )}

      {runs != null && runs.length === 0 && (
        <Empty description="No Claude runs yet for this ticket" />
      )}

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {runs?.map((run) => {
          const isInFlight = run.status === 'PENDING' || run.status === 'RUNNING';
          const isError = run.status === 'FAILED' || run.status === 'CAPPED';

          return (
            <Card
              key={run.id}
              size="small"
              title={
                <Space>
                  <Tag color={statusColors[run.status]}>{run.status}</Tag>
                  <Text strong>{String(run.model).toUpperCase()}</Text>
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                    started {parseApiDate(run.createdAt).toLocaleString()}
                  </Text>
                </Space>
              }
              style={{ background: '#141414' }}
            >
              {isInFlight && (
                <Space>
                  <Spin size="small" />
                  <Text type="secondary">Claude is investigating…</Text>
                </Space>
              )}

              {run.status === 'SUCCEEDED' && (
                <div>
                  <Space wrap style={{ marginBottom: 8 }}>
                    {run.prUrl && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<LinkOutlined />}
                        href={run.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View PR on GitHub
                      </Button>
                    )}
                    {run.branchName && (
                      <span>
                        <Text type="secondary" style={{ fontSize: 12 }}>branch </Text>
                        <Text code>{run.branchName}</Text>
                      </span>
                    )}
                  </Space>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatCost(run.costUsd)} · {run.tokensIn ?? 0} in / {run.tokensOut ?? 0} out · {formatDuration(run.durationMs)}
                    </Text>
                  </div>
                  {run.analysisMarkdown && (
                    <Collapse
                      size="small"
                      items={[
                        {
                          key: 'analysis',
                          label: 'Analysis',
                          children: (
                            <div className="claude-analysis-md" style={{ fontSize: 13 }}>
                              <ReactMarkdown>{run.analysisMarkdown}</ReactMarkdown>
                            </div>
                          ),
                        },
                      ]}
                    />
                  )}
                </div>
              )}

              {isError && (
                <div>
                  {run.errorMessage && (
                    <Paragraph style={{ color: '#e53935', marginBottom: 4 }}>{run.errorMessage}</Paragraph>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatCost(run.costUsd)} · {run.tokensIn ?? 0} in / {run.tokensOut ?? 0} out · {formatDuration(run.durationMs)}
                  </Text>
                </div>
              )}
            </Card>
          );
        })}
      </Space>
    </div>
  );
};

export default ClaudeActivityTab;
