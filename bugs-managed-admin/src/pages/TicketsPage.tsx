import React, { useEffect, useState } from 'react';
import { Table, Select, Tag, Button, Modal, Input, Space, Typography, Card, message, Collapse, List, Divider } from 'antd';
import {
  PlayCircleOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ApiOutlined,
  CommentOutlined,
  QuestionCircleOutlined,
  LockOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  CloudOutlined,
  SendOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { projectApi, ticketApi, ticketAssignApi, noteApi, teamApi, type Project, type Ticket, type TicketNote, type TeamMember } from '../api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const priorityColors: Record<string, string> = {
  CRITICAL: 'red',
  HIGH: 'orange',
  MEDIUM: 'blue',
  LOW: 'default',
};

const statusColors: Record<string, string> = {
  OPEN: 'gold',
  IN_PROGRESS: 'processing',
  IN_REVIEW: 'purple',
  READY_FOR_TESTING: 'cyan',
  VERIFIED: 'geekblue',
  RESOLVED: 'success',
  CLOSED: 'default',
};

const noteTypeColors: Record<string, string> = {
  COMMENT: '#4caf50',
  QUESTION: '#ff9800',
  INTERNAL: '#9c27b0',
};

const noteTypeIcons: Record<string, React.ReactNode> = {
  COMMENT: <CommentOutlined />,
  QUESTION: <QuestionCircleOutlined />,
  INTERNAL: <LockOutlined />,
};

const statuses = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'READY_FOR_TESTING', 'VERIFIED', 'RESOLVED', 'CLOSED'];
const types = ['BUG', 'FEATURE_REQUEST', 'QUESTION'];
const environments = ['PRODUCTION', 'STAGING', 'DEVELOPMENT'];

const developerCategories = [
  { value: 'UI', label: 'UI', color: '#e91e63' },
  { value: 'UX', label: 'UX', color: '#9c27b0' },
  { value: 'FRONTEND', label: 'Frontend', color: '#2196f3' },
  { value: 'BACKEND', label: 'Backend', color: '#4caf50' },
  { value: 'FULLSTACK', label: 'Full Stack', color: '#00bcd4' },
  { value: 'DEVOPS', label: 'DevOps', color: '#ff5722' },
  { value: 'DATABASE', label: 'Database', color: '#795548' },
  { value: 'MOBILE', label: 'Mobile', color: '#673ab7' },
  { value: 'QA', label: 'QA', color: '#ff9800' },
  { value: 'SECURITY', label: 'Security', color: '#f44336' },
  { value: 'API', label: 'API', color: '#607d8b' },
  { value: 'DATA_ENGINEERING', label: 'Data Engineering', color: '#3f51b5' },
  { value: 'INFRASTRUCTURE', label: 'Infrastructure', color: '#827717' },
];

const devCatColorMap = Object.fromEntries(developerCategories.map(c => [c.value, c.color]));
const devCatLabelMap = Object.fromEntries(developerCategories.map(c => [c.value, c.label]));

interface TicketsPageProps {
  isPlatformAdmin?: boolean;
}

const TicketsPage: React.FC<TicketsPageProps> = ({ isPlatformAdmin }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<number | null | 'all'>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [videoModal, setVideoModal] = useState<number | null>(null);
  const [resolveModal, setResolveModal] = useState<Ticket | null>(null);
  const [resolution, setResolution] = useState('');

  // Team members for assignment dropdown
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Notes state
  const [notesMap, setNotesMap] = useState<Record<number, TicketNote[]>>({});
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});
  const [noteType, setNoteType] = useState<Record<number, string>>({});
  const [notesLoading, setNotesLoading] = useState<Record<number, boolean>>({});

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

  useEffect(() => {
    projectApi.list().then((data) => {
      setProjects(data);
      if (isPlatformAdmin && data.length > 1) {
        setSelectedProject('all');
      } else if (data.length > 0) {
        setSelectedProject(data[0].id);
      }
    });
    teamApi.list().then(setTeamMembers).catch(() => {});
  }, [isPlatformAdmin]);

  const loadTickets = () => {
    setLoading(true);
    const projectId = selectedProject === 'all' ? undefined : (selectedProject as number);
    ticketApi.list(projectId || undefined, statusFilter, typeFilter)
      .then(setTickets)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (selectedProject) loadTickets(); }, [selectedProject, statusFilter, typeFilter]);

  const handleStatusChange = async (ticketId: number, status: string) => {
    await ticketApi.updateStatus(ticketId, status);
    message.success('Status updated');
    loadTickets();
  };

  const handleResolve = async () => {
    if (!resolveModal) return;
    await ticketApi.resolve(resolveModal.id, resolution);
    message.success('Ticket resolved');
    setResolveModal(null);
    setResolution('');
    loadTickets();
  };

  const handleAssign = async (ticketId: number, assignedTo: string) => {
    await ticketAssignApi.assign(ticketId, assignedTo);
    message.success(`Assigned to ${assignedTo}`);
    loadTickets();
  };

  const handleCategoryChange = async (ticketId: number, category: string) => {
    await ticketAssignApi.updateCategory(ticketId, category);
    message.success('Developer category updated');
    loadTickets();
  };

  const handleEscalate = async (ticket: Ticket) => {
    const currentUser = JSON.parse(localStorage.getItem('bom_user') || '{}');
    await ticketApi.escalate(ticket.id, currentUser.email || 'admin');
    message.success('Ticket escalated — team notified');
    loadTickets();
  };

  // Notes handlers
  const loadNotes = async (ticketId: number) => {
    setNotesLoading(prev => ({ ...prev, [ticketId]: true }));
    try {
      const notes = await noteApi.list(ticketId);
      setNotesMap(prev => ({ ...prev, [ticketId]: notes }));
    } finally {
      setNotesLoading(prev => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleAddNote = async (ticketId: number) => {
    const content = noteInput[ticketId]?.trim();
    if (!content) return;
    const type = noteType[ticketId] || 'COMMENT';
    await noteApi.add(ticketId, content, type);
    setNoteInput(prev => ({ ...prev, [ticketId]: '' }));
    loadNotes(ticketId);
    message.success('Note added');
  };

  const handleDeleteNote = async (ticketId: number, noteId: number) => {
    await noteApi.delete(ticketId, noteId);
    loadNotes(ticketId);
    message.success('Note deleted');
  };

  // Parse JSON error strings for display
  const renderConsoleErrors = (json: string) => {
    try {
      const errors = JSON.parse(json);
      return (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {errors.map((err: any, i: number) => (
            <div key={i} style={{
              padding: '4px 8px',
              marginBottom: 4,
              background: '#1a0a0a',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 11,
              borderLeft: '3px solid #e53935',
            }}>
              <div style={{ color: '#e53935', fontWeight: 600 }}>{err.type}</div>
              <div style={{ color: '#ccc' }}>{err.message}</div>
              {err.source && <div style={{ color: '#888', fontSize: 10 }}>{err.source}:{err.line}:{err.col}</div>}
              <div style={{ color: '#666', fontSize: 10 }}>{err.timestamp}</div>
            </div>
          ))}
        </div>
      );
    } catch { return <Text type="secondary">{json}</Text>; }
  };

  const renderNetworkErrors = (json: string) => {
    try {
      const errors = JSON.parse(json);
      return (
        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
          {errors.map((err: any, i: number) => (
            <div key={i} style={{
              padding: '4px 8px',
              marginBottom: 4,
              background: '#0a0a1a',
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 11,
              borderLeft: '3px solid #ff9800',
            }}>
              <Tag color={err.status >= 500 ? 'red' : 'orange'} style={{ fontSize: 10 }}>
                {err.method} {err.status}
              </Tag>
              <span style={{ color: '#ccc' }}>{err.url}</span>
              <div style={{ color: '#888', fontSize: 10 }}>{err.statusText} - {err.timestamp}</div>
            </div>
          ))}
        </div>
      );
    } catch { return <Text type="secondary">{json}</Text>; }
  };

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: 'Title', dataIndex: 'title', key: 'title', ellipsis: true },
  ];

  // Application column when viewing all
  if (selectedProject === 'all') {
    columns.push({
      title: 'Application',
      dataIndex: 'projectId',
      key: 'application',
      width: 160,
      render: (v: number) => <Tag icon={<AppstoreOutlined />} color="blue">{projectMap[v] || `Project ${v}`}</Tag>,
    });
  }

  columns.push(
    {
      title: 'Type',
      dataIndex: 'ticketType',
      key: 'ticketType',
      width: 130,
      render: (v: string) => <Tag>{v.replace('_', ' ')}</Tag>,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 100,
      render: (v: string) => <Tag color={priorityColors[v]}>{v}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 180,
      render: (v: string, record: Ticket) => (
        <Select
          value={v}
          size="small"
          style={{ width: 160 }}
          onChange={(val) => handleStatusChange(record.id, val)}
          options={statuses.map((s) => ({ label: s.replace(/_/g, ' '), value: s }))}
        />
      ),
    },
  );

  // Tenant columns — only show if data exists
  const hasTenantData = tickets.some(t => t.tenantName || t.tenantId);
  if (hasTenantData) {
    columns.push({
      title: 'Tenant',
      key: 'tenant',
      width: 140,
      render: (_: any, record: Ticket) =>
        record.tenantName ? (
          <span>{record.tenantName}</span>
        ) : record.tenantId ? (
          <Text type="secondary">{record.tenantId}</Text>
        ) : '-',
    });
  }

  const hasDbData = tickets.some(t => t.databaseName);
  if (hasDbData) {
    columns.push({
      title: 'Database',
      key: 'database',
      width: 120,
      render: (_: any, record: Ticket) =>
        record.databaseName ? <Tag icon={<DatabaseOutlined />}>{record.databaseName}</Tag> : '-',
    });
  }

  const hasEnvData = tickets.some(t => t.environment);
  if (hasEnvData) {
    columns.push({
      title: 'Env',
      key: 'environment',
      width: 110,
      render: (_: any, record: Ticket) => {
        if (!record.environment) return '-';
        const envColor = record.environment === 'PRODUCTION' ? 'red' : record.environment === 'STAGING' ? 'orange' : 'green';
        return <Tag icon={<CloudOutlined />} color={envColor}>{record.environment}</Tag>;
      },
    });
  }

  // Console/Network error indicator column
  const hasErrors = tickets.some(t => t.consoleErrors || t.networkErrors);
  if (hasErrors) {
    columns.push({
      title: 'Errors',
      key: 'errors',
      width: 80,
      render: (_: any, record: Ticket) => {
        const hasConsole = !!record.consoleErrors;
        const hasNetwork = !!record.networkErrors;
        if (!hasConsole && !hasNetwork) return '-';
        return (
          <Space size={4}>
            {hasConsole && <Tag color="red" icon={<WarningOutlined />} style={{ fontSize: 10 }}>JS</Tag>}
            {hasNetwork && <Tag color="orange" icon={<ApiOutlined />} style={{ fontSize: 10 }}>Net</Tag>}
          </Space>
        );
      },
    });
  }

  // Developer Category column
  columns.push({
    title: 'Dev Category',
    dataIndex: 'developerCategory',
    key: 'developerCategory',
    width: 160,
    render: (v: string, record: Ticket) => (
      <Select
        value={v || undefined}
        size="small"
        style={{ width: 140 }}
        placeholder="Unset"
        allowClear
        onChange={(val) => handleCategoryChange(record.id, val || '')}
        options={developerCategories.map((c) => ({
          label: c.label,
          value: c.value,
        }))}
        showSearch
        filterOption={(input, option) =>
          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
        }
      />
    ),
  });

  columns.push(
    { title: 'Submitted By', dataIndex: 'submittedBy', key: 'submittedBy', width: 140, ellipsis: true },
    {
      title: 'Assigned Developer',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      width: 200,
      render: (v: string, record: Ticket) => {
        // Filter developers by the ticket's AI-classified category.
        // FULLSTACK devs qualify for everything; specialty devs only match their own category.
        // If the ticket is uncategorized, show every developer so a human can triage.
        const cat = record.developerCategory;
        const eligible = teamMembers.filter((m) => {
          if (m.role !== 'DEVELOPER') return false;
          if (!cat || cat === 'FULLSTACK') return true;
          if (m.specialty === 'FULLSTACK') return true;
          return m.specialty === cat;
        });

        const placeholder = !cat
          ? 'Triage needed'
          : eligible.length === 0
            ? `No ${cat.toLowerCase()} devs`
            : 'Unassigned';

        return (
          <Select
            value={v || undefined}
            size="small"
            style={{ width: 180 }}
            placeholder={placeholder}
            allowClear
            disabled={eligible.length === 0}
            onChange={(val) => handleAssign(record.id, val || '')}
            options={eligible.map((m) => ({
              label: `${m.fullName}${m.specialty === 'FULLSTACK' ? ' (FS)' : ''}`,
              value: m.email,
            }))}
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
          />
        );
      },
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: Ticket) => (
        <Space size="small">
          {record.videoUrl && (
            <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setVideoModal(record.id)}>
              Video
            </Button>
          )}
          <Button size="small" icon={<CheckCircleOutlined />} onClick={() => setResolveModal(record)}>
            Resolve
          </Button>
          {record.visibility !== 'PLATFORM' && (
            <Button size="small" danger icon={<ArrowUpOutlined />} onClick={() => handleEscalate(record)}>
              Escalate
            </Button>
          )}
        </Space>
      ),
    },
  );

  const projectOptions: any[] = [];
  if (isPlatformAdmin || projects.length > 1) {
    projectOptions.push({ label: 'All Applications', value: 'all' });
  }
  projects.forEach((p) => projectOptions.push({ label: p.name, value: p.id }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Tickets</Title>
        <Space wrap>
          <Select
            value={selectedProject}
            onChange={setSelectedProject}
            style={{ width: 220 }}
            placeholder="Application"
            options={projectOptions}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            placeholder="All Statuses"
            allowClear
            options={statuses.map((s) => ({ label: s.replace(/_/g, ' '), value: s }))}
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 160 }}
            placeholder="All Types"
            allowClear
            options={types.map((t) => ({ label: t.replace('_', ' '), value: t }))}
          />
        </Space>
      </div>

      <Table
        dataSource={tickets}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        expandable={{
          expandedRowRender: (record) => (
            <Card size="small" style={{ background: '#141414' }}>
              {/* Description */}
              {record.description && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Description:</Text>
                  <p>{record.description}</p>
                </div>
              )}

              {/* Voice Transcript */}
              {record.transcript && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Voice Transcript:</Text>
                  <p style={{ fontStyle: 'italic' }}>{record.transcript}</p>
                </div>
              )}

              {/* Tenant Context */}
              {(record.tenantId || record.databaseName || record.applicationVersion || record.environment) && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Application Context:</Text>
                  <div style={{ marginTop: 4 }}>
                    {record.tenantId && <Tag>Tenant ID: {record.tenantId}</Tag>}
                    {record.tenantName && <Tag>Tenant: {record.tenantName}</Tag>}
                    {record.databaseName && <Tag icon={<DatabaseOutlined />}>DB: {record.databaseName}</Tag>}
                    {record.applicationVersion && <Tag>v{record.applicationVersion}</Tag>}
                    {record.environment && <Tag icon={<CloudOutlined />}>{record.environment}</Tag>}
                  </div>
                </div>
              )}

              {/* Console Errors */}
              {record.consoleErrors && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ color: '#e53935' }}><WarningOutlined /> Console Errors:</Text>
                  <div style={{ marginTop: 4 }}>{renderConsoleErrors(record.consoleErrors)}</div>
                </div>
              )}

              {/* Network Errors */}
              {record.networkErrors && (
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ color: '#ff9800' }}><ApiOutlined /> Network Errors:</Text>
                  <div style={{ marginTop: 4 }}>{renderNetworkErrors(record.networkErrors)}</div>
                </div>
              )}

              {/* Browser / Page Context */}
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {record.currentPageUrl && <Text type="secondary">Page: {record.currentPageUrl}</Text>}
                {record.browserInfo && <Text type="secondary">Browser: {record.browserInfo?.slice(0, 80)}...</Text>}
                {record.screenWidth && <Text type="secondary">Screen: {record.screenWidth}x{record.screenHeight}</Text>}
                {record.resolution && <Text type="success">Resolution: {record.resolution}</Text>}
                {record.videoUrl && (
                  <div style={{ marginTop: 8 }}>
                    <video
                      src={ticketApi.videoUrl(record.id)}
                      controls
                      style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                    />
                  </div>
                )}
              </Space>

              {/* Chat / Notes Thread */}
              <Divider style={{ margin: '16px 0 12px' }} />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong><CommentOutlined /> Chat <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>synced with Slack</Text></Text>
                  {!notesMap[record.id] && (
                    <Button size="small" onClick={() => loadNotes(record.id)} loading={notesLoading[record.id]}>
                      Load Chat
                    </Button>
                  )}
                </div>

                {notesMap[record.id] && (
                  <>
                    {notesMap[record.id].length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>No messages yet. Messages posted here will also appear in Slack.</Text>
                    ) : (
                      <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
                        {notesMap[record.id].map((note: TicketNote) => {
                          const isSlack = note.source === 'SLACK';
                          return (
                            <div key={note.id} style={{
                              display: 'flex',
                              gap: 8,
                              padding: '8px 10px',
                              marginBottom: 4,
                              background: isSlack ? '#1a1a2e' : '#0d1117',
                              borderRadius: 8,
                              borderLeft: `3px solid ${isSlack ? '#4A154B' : noteTypeColors[note.noteType] || '#4caf50'}`,
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                  {isSlack && (
                                    <Tag color="#4A154B" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}>Slack</Tag>
                                  )}
                                  <Tag
                                    color={noteTypeColors[note.noteType]}
                                    icon={noteTypeIcons[note.noteType]}
                                    style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}
                                  >
                                    {note.noteType}
                                  </Tag>
                                  <Text strong style={{ fontSize: 12 }}>{note.authorName || note.authorEmail}</Text>
                                  <Text type="secondary" style={{ fontSize: 10 }}>
                                    {new Date(note.createdAt).toLocaleString()}
                                  </Text>
                                </div>
                                <Text style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{note.content}</Text>
                              </div>
                              {!isSlack && (
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleDeleteNote(record.id, note.id)}
                                  style={{ alignSelf: 'flex-start' }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add note form */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Select
                        value={noteType[record.id] || 'COMMENT'}
                        onChange={(val) => setNoteType(prev => ({ ...prev, [record.id]: val }))}
                        size="small"
                        style={{ width: 120 }}
                        options={[
                          { label: 'Comment', value: 'COMMENT' },
                          { label: 'Question', value: 'QUESTION' },
                          { label: 'Internal', value: 'INTERNAL' },
                        ]}
                      />
                      <TextArea
                        value={noteInput[record.id] || ''}
                        onChange={(e) => setNoteInput(prev => ({ ...prev, [record.id]: e.target.value }))}
                        placeholder="Add a note..."
                        rows={1}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        style={{ flex: 1 }}
                        size="small"
                      />
                      <Button
                        type="primary"
                        size="small"
                        icon={<SendOutlined />}
                        onClick={() => handleAddNote(record.id)}
                        disabled={!noteInput[record.id]?.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ),
          onExpand: (expanded, record) => {
            if (expanded && !notesMap[record.id]) {
              loadNotes(record.id);
            }
          },
        }}
        pagination={{ pageSize: 20 }}
      />

      {/* Video Modal */}
      <Modal
        title="Screen Recording"
        open={videoModal !== null}
        onCancel={() => setVideoModal(null)}
        footer={null}
        width={800}
      >
        {videoModal && (
          <video
            src={ticketApi.videoUrl(videoModal)}
            controls
            autoPlay
            style={{ width: '100%', borderRadius: 8 }}
          />
        )}
      </Modal>

      {/* Resolve Modal */}
      <Modal
        title={`Resolve Ticket #${resolveModal?.id}`}
        open={resolveModal !== null}
        onOk={handleResolve}
        onCancel={() => { setResolveModal(null); setResolution(''); }}
        okText="Resolve"
      >
        <TextArea
          rows={4}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder="Describe how this was resolved..."
        />
      </Modal>
    </div>
  );
};

export default TicketsPage;
