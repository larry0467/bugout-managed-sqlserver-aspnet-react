import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  DatePicker,
  Typography,
  Statistic,
  Tag,
  Progress,
  Table,
  Spin,
  Avatar,
  Space,
  Empty,
} from 'antd';
import {
  TrophyOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  projectApi,
  dashboardApi,
  type Project,
  type PerformanceDashboard,
  type DeveloperPerformance,
  type AuthUser,
  type BottleneckStage,
  type DeveloperSpecialty,
} from '../api';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

interface PerformancePageProps {
  isPlatformAdmin?: boolean;
}

// House palette — sapphire ink theme.
const SAPPHIRE = '#1f3a8a';
const ICE = '#dbeafe';
const TEAL = '#26c6da';

const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// Format minutes as "2h 14m" or "32m" or "45s".
const fmtMinutes = (min: number | null | undefined): string => {
  if (min == null || !isFinite(min)) return '—';
  if (min < 1) {
    const s = Math.max(1, Math.round(min * 60));
    return `${s}s`;
  }
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
};

const fmtSeconds = (s: number | null | undefined): string => {
  if (s == null || !isFinite(s)) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
};

const fmtUsd = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return '$0.00';
  if (v >= 100) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
};

// Score-color helper per spec: green ≥ 90, yellow 70-89, red < 70.
const scoreColor = (score: number): string => {
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#eab308';
  return '#ef4444';
};

const bottleneckLabel = (b: BottleneckStage): string => {
  switch (b) {
    case 'triageQueue':
      return 'Triage queue';
    case 'ownerEscalation':
      return 'Owner escalation';
    case 'devWork':
      return 'Dev work';
    case 'ownerApproval':
      return 'Owner approval';
  }
};

const PerformancePage: React.FC<PerformancePageProps> = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | 'all'>('all');
  const [dateRange, setDateRange] = useState<[Date, Date]>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return [from, to];
  });
  const [priority, setPriority] = useState<string | undefined>(undefined);
  const [specialtyFilter, setSpecialtyFilter] = useState<DeveloperSpecialty | 'ALL'>('ALL');
  const [data, setData] = useState<PerformanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUser: AuthUser = JSON.parse(localStorage.getItem('bom_user') || '{}');
  const isPlatformOwner = currentUser.role === 'PLATFORM_OWNER';

  useEffect(() => {
    projectApi.list().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Parameters<typeof dashboardApi.performance>[0] = {
      from: dateRange[0].toISOString(),
      to: dateRange[1].toISOString(),
    };
    if (selectedProject !== 'all') params.projectId = selectedProject;
    if (priority) params.priority = priority;
    dashboardApi
      .performance(params)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedProject, dateRange, priority]);

  const projectOptions = useMemo(() => {
    const opts: any[] = [{ label: 'All applications', value: 'all' }];
    projects.forEach((p) => opts.push({ label: p.name, value: p.id }));
    return opts;
  }, [projects]);

  const filteredDevs = useMemo<DeveloperPerformance[]>(() => {
    if (!data) return [];
    if (specialtyFilter === 'ALL') return data.developers;
    return data.developers.filter((d) => d.specialty === specialtyFilter);
  }, [data, specialtyFilter]);

  const stageCards = useMemo(() => {
    if (!data) return [];
    const sa = data.stageAverages;
    const items: { key: BottleneckStage; title: string; median: number; p90: number }[] = [
      {
        key: 'triageQueue',
        title: 'Triage queue',
        median: sa.triageQueueMedianMinutes,
        p90: sa.triageQueueP90Minutes,
      },
      {
        key: 'ownerEscalation',
        title: 'Owner escalation',
        median: sa.ownerEscalationMedianMinutes,
        p90: sa.ownerEscalationP90Minutes,
      },
      {
        key: 'devWork',
        title: 'Dev work',
        median: sa.devWorkMedianMinutes,
        p90: sa.devWorkP90Minutes,
      },
      {
        key: 'ownerApproval',
        title: 'Owner approval',
        median: sa.ownerApprovalMedianMinutes,
        p90: sa.ownerApprovalP90Minutes,
      },
    ];
    return items;
  }, [data]);

  const developerColumns = useMemo(
    () => [
      {
        title: 'Developer',
        key: 'dev',
        render: (_: any, r: DeveloperPerformance) => (
          <Space>
            <Avatar
              size="small"
              style={{ background: SAPPHIRE, color: ICE }}
              icon={<UserOutlined />}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{r.displayName || r.email}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {r.email}
                {r.specialty ? ` · ${r.specialty}` : ''}
              </Text>
            </div>
          </Space>
        ),
      },
      {
        title: 'Tickets',
        dataIndex: 'ticketsResolved',
        key: 'ticketsResolved',
        width: 90,
        align: 'right' as const,
        sorter: (a: DeveloperPerformance, b: DeveloperPerformance) =>
          a.ticketsResolved - b.ticketsResolved,
      },
      {
        title: 'Median dev work',
        dataIndex: 'medianDevWorkMinutes',
        key: 'medianDevWorkMinutes',
        width: 140,
        align: 'right' as const,
        sorter: (a: DeveloperPerformance, b: DeveloperPerformance) =>
          a.medianDevWorkMinutes - b.medianDevWorkMinutes,
        render: (v: number) => fmtMinutes(v),
      },
      {
        title: 'p90',
        dataIndex: 'p90DevWorkMinutes',
        key: 'p90DevWorkMinutes',
        width: 100,
        align: 'right' as const,
        render: (v: number) => fmtMinutes(v),
      },
      {
        title: 'Revision rate',
        dataIndex: 'revisionRate',
        key: 'revisionRate',
        width: 120,
        align: 'right' as const,
        render: (v: number) => `${Math.round((v || 0) * 100)}%`,
      },
      {
        title: 'Score',
        dataIndex: 'score',
        key: 'score',
        width: 180,
        sorter: (a: DeveloperPerformance, b: DeveloperPerformance) => a.score - b.score,
        defaultSortOrder: 'descend' as const,
        render: (v: number) => (
          <Progress
            percent={Math.round(v)}
            size="small"
            strokeColor={scoreColor(v)}
            format={(p) => <span style={{ color: scoreColor(v) }}>{p}</span>}
          />
        ),
      },
    ],
    []
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Performance
        </Title>
        <Space wrap>
          <Select
            value={selectedProject}
            onChange={setSelectedProject}
            style={{ width: 220 }}
            options={projectOptions}
          />
          <RangePicker
            value={[dateRange[0] as any, dateRange[1] as any]}
            onChange={(vals) => {
              if (vals && vals[0] && vals[1]) {
                setDateRange([(vals[0] as any).toDate?.() || new Date(vals[0] as any),
                              (vals[1] as any).toDate?.() || new Date(vals[1] as any)]);
              }
            }}
          />
          <Select
            value={priority}
            onChange={setPriority}
            style={{ width: 160 }}
            placeholder="All priorities"
            allowClear
            options={priorities.map((p) => ({ label: p, value: p }))}
          />
        </Space>
      </div>

      {loading && !data ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : !data ? (
        <Empty description="Performance data not available yet." />
      ) : (
        <Row gutter={[16, 16]}>
          {/* Main column */}
          <Col xs={24} lg={16}>
            {/* Owner score (PLATFORM_OWNER only) */}
            {isPlatformOwner && (
              <Card
                title={
                  <Space>
                    <TrophyOutlined style={{ color: TEAL }} />
                    <span>Your performance</span>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                      {data.ownerScore.platformOwnerEmail} · {data.ownerScore.ticketsHandled} tickets
                    </Text>
                  </Space>
                }
                style={{ marginBottom: 16, borderTop: `3px solid ${SAPPHIRE}` }}
              >
                <Row gutter={16} align="middle">
                  <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                    <Progress
                      type="circle"
                      percent={Math.round(data.ownerScore.compositeScore)}
                      size={140}
                      strokeColor={scoreColor(data.ownerScore.compositeScore)}
                      format={(p) => (
                        <span style={{ color: scoreColor(data.ownerScore.compositeScore) }}>
                          {p}
                        </span>
                      )}
                    />
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary">Composite score</Text>
                    </div>
                  </Col>
                  <Col xs={24} sm={16}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Statistic
                          title="Escalation speed"
                          value={Math.round(data.ownerScore.escalationSpeed.score)}
                          valueStyle={{
                            color: scoreColor(data.ownerScore.escalationSpeed.score),
                          }}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          median {fmtMinutes(data.ownerScore.escalationSpeed.medianMinutes)} ·{' '}
                          {data.ownerScore.escalationSpeed.withinSlaCount}/
                          {data.ownerScore.escalationSpeed.totalCount} within SLA
                        </Text>
                      </Col>
                      <Col span={12}>
                        <Statistic
                          title="Approval speed"
                          value={Math.round(data.ownerScore.approvalSpeed.score)}
                          valueStyle={{
                            color: scoreColor(data.ownerScore.approvalSpeed.score),
                          }}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          median {fmtMinutes(data.ownerScore.approvalSpeed.medianMinutes)} ·{' '}
                          {data.ownerScore.approvalSpeed.withinSlaCount}/
                          {data.ownerScore.approvalSpeed.totalCount} within SLA
                        </Text>
                      </Col>
                    </Row>
                  </Col>
                </Row>
              </Card>
            )}

            {/* Org-wide stage averages */}
            <Card
              title="Org-wide stage averages"
              style={{ marginBottom: 16 }}
              extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {data.window.ticketsConsidered} tickets considered
                </Text>
              }
            >
              <Row gutter={[12, 12]}>
                {stageCards.map((s) => {
                  const isBottleneck = s.key === data.bottleneckStage;
                  return (
                    <Col xs={12} md={6} key={s.key}>
                      <Card
                        size="small"
                        style={{
                          borderLeft: `3px solid ${isBottleneck ? '#ef4444' : SAPPHIRE}`,
                          background: '#141414',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                        >
                          <Text style={{ fontSize: 12 }} type="secondary">
                            {s.title}
                          </Text>
                          {isBottleneck && (
                            <Tag color="red" style={{ marginInlineEnd: 0, fontSize: 10 }}>
                              Bottleneck
                            </Tag>
                          )}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                          {fmtMinutes(s.median)}
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          p90 {fmtMinutes(s.p90)}
                        </Text>
                      </Card>
                    </Col>
                  );
                })}
                <Col xs={24} md={24}>
                  <Card
                    size="small"
                    style={{ borderLeft: `3px solid ${TEAL}`, background: '#141414' }}
                  >
                    <Row>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Total median turnaround
                        </Text>
                        <div style={{ fontSize: 22, fontWeight: 600 }}>
                          {fmtMinutes(data.stageAverages.totalMedianMinutes)}
                        </div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Total p90
                        </Text>
                        <div style={{ fontSize: 22, fontWeight: 600 }}>
                          {fmtMinutes(data.stageAverages.totalP90Minutes)}
                        </div>
                      </Col>
                      <Col span={24}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Slowest stage:{' '}
                          <Text strong style={{ color: '#ef4444' }}>
                            {bottleneckLabel(data.bottleneckStage)}
                          </Text>
                        </Text>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              </Row>
            </Card>

            {/* Developer leaderboard */}
            <Card
              title="Developer leaderboard"
              style={{ marginBottom: 16 }}
              extra={
                <Select
                  size="small"
                  value={specialtyFilter}
                  onChange={(v) => setSpecialtyFilter(v)}
                  style={{ width: 160 }}
                  options={[
                    { label: 'All specialties', value: 'ALL' },
                    { label: 'Frontend', value: 'FRONTEND' },
                    { label: 'Backend', value: 'BACKEND' },
                    { label: 'Fullstack', value: 'FULLSTACK' },
                  ]}
                />
              }
            >
              <Table
                rowKey="email"
                dataSource={filteredDevs}
                columns={developerColumns}
                size="small"
                pagination={{ pageSize: 10 }}
              />
            </Card>

            {/* Category breakdown */}
            <Card title="Category breakdown — median dev work">
              {data.categorySummary.length === 0 ? (
                <Empty description="No category data in this window" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={data.categorySummary.map((c) => ({
                      category: c.category,
                      median: Math.round(c.medianDevWorkMinutes),
                      tickets: c.ticketsResolved,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="category" stroke="#888" fontSize={12} />
                    <YAxis
                      stroke="#888"
                      label={{
                        value: 'minutes',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#888',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }}
                      formatter={(value: any, name: string) =>
                        name === 'median' ? [`${value} min`, 'median dev work'] : [value, name]
                      }
                    />
                    <Bar dataKey="median" fill={SAPPHIRE} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </Col>

          {/* Right column — Claude card */}
          <Col xs={24} lg={8}>
            <Card
              title={
                <Space>
                  <RobotOutlined style={{ color: TEAL }} />
                  <span>Claude (AI Developer)</span>
                </Space>
              }
              style={{
                borderTop: `3px solid ${TEAL}`,
                background: 'linear-gradient(180deg, rgba(38,198,218,0.06) 0%, transparent 100%)',
              }}
            >
              <Row gutter={[12, 16]}>
                <Col span={12}>
                  <Statistic
                    title="Tickets resolved"
                    value={data.claude.ticketsResolved}
                    prefix={<ThunderboltOutlined style={{ color: TEAL }} />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic title="Total runs" value={data.claude.totalRuns} />
                  <Space size={4} style={{ marginTop: 4 }}>
                    <Tag color="success" style={{ fontSize: 10 }}>
                      {data.claude.successfulRuns} ok
                    </Tag>
                    <Tag color="warning" style={{ fontSize: 10 }}>
                      {data.claude.cappedRuns} capped
                    </Tag>
                    <Tag color="error" style={{ fontSize: 10 }}>
                      {data.claude.failedRuns} failed
                    </Tag>
                  </Space>
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Median runtime"
                    value={fmtSeconds(data.claude.medianAgentRuntimeSeconds)}
                    valueStyle={{ color: TEAL, fontSize: 20 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Median turnaround"
                    value={fmtMinutes(data.claude.medianEffectiveTurnaroundMinutes)}
                    valueStyle={{ fontSize: 20 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Median cost"
                    value={fmtUsd(data.claude.medianCostUsd)}
                    valueStyle={{ fontSize: 20 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Total cost"
                    value={fmtUsd(data.claude.totalCostUsd)}
                    valueStyle={{ fontSize: 20 }}
                  />
                </Col>
              </Row>
              <Paragraph
                type="secondary"
                style={{
                  marginTop: 16,
                  marginBottom: 0,
                  fontSize: 12,
                  borderTop: '1px solid #2a2a2a',
                  paddingTop: 12,
                }}
              >
                Claude is scored separately — agents and humans aren&apos;t directly comparable.
              </Paragraph>
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

export default PerformancePage;
