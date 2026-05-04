import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, Table, Statistic, Typography, Spin, Tag } from 'antd';
import {
  BugOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  TeamOutlined,
  AppstoreOutlined,
  FieldTimeOutlined,
} from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { projectApi, ticketApi, type Project, type Ticket, type Stats } from '../api';

const { Title } = Typography;

interface DashboardPageProps {
  isPlatformAdmin?: boolean;
}

const DashboardPage: React.FC<DashboardPageProps> = ({ isPlatformAdmin }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null | 'all'>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  useEffect(() => {
    projectApi.list().then((data) => {
      setProjects(data);
      if (isPlatformAdmin && data.length > 1) {
        setSelectedProject('all');
      } else if (data.length > 0) {
        setSelectedProject(data[0].id);
      }
    }).finally(() => setLoading(false));
  }, [isPlatformAdmin]);

  useEffect(() => {
    if (selectedProject === 'all') {
      ticketApi.stats().then(setStats);
      ticketApi.list().then(setTickets);
    } else if (typeof selectedProject === 'number') {
      ticketApi.stats(selectedProject).then(setStats);
      ticketApi.list(selectedProject).then(setTickets);
    }
  }, [selectedProject]);

  const statCards = stats ? [
    { title: 'Open', value: stats.open, icon: <ExclamationCircleOutlined />, color: '#ff9800' },
    { title: 'In Progress', value: stats.inProgress, icon: <ClockCircleOutlined />, color: '#2196f3' },
    { title: 'Resolved', value: stats.resolved, icon: <CheckCircleOutlined />, color: '#4caf50' },
    { title: 'Critical', value: stats.critical, icon: <BugOutlined />, color: '#f44336' },
    { title: 'Escalated', value: stats.escalated, icon: <EyeOutlined />, color: '#9c27b0' },
    { title: 'Total', value: stats.total, icon: <TeamOutlined />, color: '#607d8b' },
  ] : [];

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
    // Host app chip — always visible so the dev team can see at a glance
    // which Managed app a ticket came from. This is the per-app tenancy
    // view the user asked for.
    {
      title: 'Host App',
      dataIndex: 'projectId',
      key: 'application',
      width: 180,
      render: (v: number) => <Tag icon={<AppstoreOutlined />} color="cyan">{projectMap[v] || `Project ${v}`}</Tag>,
    },
    { title: 'Type', dataIndex: 'ticketType', key: 'ticketType', width: 130 },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 100 },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 140 },
  ];

  const hasTenantData = tickets.some(t => t.tenantName || t.tenantId);
  if (hasTenantData) {
    columns.push({
      title: 'Tenant',
      key: 'tenant',
      width: 140,
      render: (_: any, record: Ticket) => record.tenantName || record.tenantId || '-',
    });
  }

  columns.push(
    { title: 'Submitted By', dataIndex: 'submittedBy', key: 'submittedBy', width: 150 },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
    },
  );

  const chartData = (() => {
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days[key] = 0;
    }
    tickets.forEach((t) => {
      const key = t.createdAt?.split('T')[0];
      if (key && days[key] !== undefined) days[key]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date: date.slice(5), count }));
  })();

  // Per-app volume + turnaround tables joined from the stats endpoint.
  const byProjectRows = stats?.byProject ?? [];
  const turnaroundByProjectMap = new Map(
    (stats?.turnaround?.byProject ?? []).map(x => [x.projectId, x])
  );

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const projectOptions: any[] = [];
  if (isPlatformAdmin || projects.length > 1) {
    projectOptions.push({ label: 'All Applications', value: 'all' });
  }
  projects.forEach((p) => projectOptions.push({ label: p.name, value: p.id }));

  const projectColumns = [
    {
      title: 'Host App',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <Tag icon={<AppstoreOutlined />} color="cyan">{v}</Tag>,
    },
    { title: 'Total', dataIndex: 'total', key: 'total', width: 80, align: 'right' as const },
    { title: 'Open', dataIndex: 'open', key: 'open', width: 80, align: 'right' as const },
    { title: 'In Progress', dataIndex: 'inProgress', key: 'inProgress', width: 110, align: 'right' as const },
    { title: 'Resolved', dataIndex: 'resolved', key: 'resolved', width: 100, align: 'right' as const },
    {
      title: 'Critical',
      dataIndex: 'critical',
      key: 'critical',
      width: 100,
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : v,
    },
    {
      title: 'Avg Turnaround',
      key: 'avgHours',
      width: 150,
      align: 'right' as const,
      render: (_: any, r: any) => {
        const t = turnaroundByProjectMap.get(r.projectId);
        if (!t) return <span style={{ color: '#888' }}>—</span>;
        return <span>{t.avgHours.toFixed(1)}h <span style={{ color: '#888' }}>({t.resolvedCount})</span></span>;
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>
          {isPlatformAdmin ? 'Platform Dashboard' : 'Dashboard'}
        </Title>
        <Select
          value={selectedProject}
          onChange={setSelectedProject}
          style={{ width: 280 }}
          placeholder="Select application"
          options={projectOptions}
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {statCards.map((s) => (
          <Col xs={12} sm={8} md={4} key={s.title}>
            <Card size="small" style={{ borderLeft: `3px solid ${s.color}` }}>
              <Statistic title={s.title} value={s.value} prefix={s.icon} />
            </Card>
          </Col>
        ))}
      </Row>

      {stats?.turnaround && (stats.turnaround.avgHours !== null || stats.turnaround.medianHours !== null) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} md={6}>
            <Card size="small" style={{ borderLeft: '3px solid #00bcd4' }}>
              <Statistic
                title="Avg Turnaround"
                value={stats.turnaround.avgHours ?? 0}
                precision={1}
                suffix="h"
                prefix={<FieldTimeOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" style={{ borderLeft: '3px solid #00bcd4' }}>
              <Statistic
                title="Median Turnaround"
                value={stats.turnaround.medianHours ?? 0}
                precision={1}
                suffix="h"
                prefix={<FieldTimeOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card title="Ticket Volume (Last 30 Days)" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#888" fontSize={11} />
            <YAxis stroke="#888" allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
            <Bar dataKey="count" fill="#4caf50" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {byProjectRows.length > 0 && (
        <Card title="Issues by Host App" style={{ marginBottom: 24 }}>
          <Table
            dataSource={byProjectRows}
            columns={projectColumns}
            rowKey="projectId"
            size="small"
            pagination={false}
          />
        </Card>
      )}

      <Card title="Recent Tickets">
        <Table
          dataSource={tickets.slice(0, 20)}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
