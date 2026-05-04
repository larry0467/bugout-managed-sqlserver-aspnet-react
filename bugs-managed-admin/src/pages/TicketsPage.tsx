import React, { useEffect, useMemo, useState } from 'react';
import { Table, Select, Tag, Button, Modal, Input, Space, Typography, Card, message, Tabs, Divider, Checkbox } from 'antd';
import {
  PlayCircleOutlined,
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
  RobotOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Resizable, type ResizeCallbackData } from 'react-resizable';
import 'react-resizable/css/styles.css';
import { projectApi, ticketApi, ticketAssignApi, noteApi, teamApi, type Project, type Ticket, type TicketNote, type TeamMember, type AuthUser, type EscalationStage } from '../api';
import EscalationPanel from '../components/EscalationPanel';
import ClaudeActivityTab from '../components/ClaudeActivityTab';

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

// Drag-to-reorder + drag-to-resize support for the tickets grid header.
// Each header cell carries a sortable handle (pointer-drag horizontally
// to swap column order) AND a resize handle on its right edge (drag the
// thin strip to widen/narrow). Both order and per-column widths are
// persisted to localStorage keyed by user email so they stick across
// logins.
//
// Resize state is piped through a React context (not data-* attrs). An
// earlier version stuffed the onResize callback into a `data-on-resize`
// attribute on the th, which crashed antd's column-shape validator
// (trying to call .isValid on the resulting attribute). Context keeps
// the th's DOM attrs strictly primitives.
const COLUMN_ORDER_STORAGE_PREFIX = 'bom-tickets-col-order:';
const COLUMN_WIDTH_STORAGE_PREFIX = 'bom-tickets-col-widths:';
const ACTIONS_COLUMN_KEY = 'actions';

interface ResizeContextValue {
  widths: Record<string, number>;
  onResize: (key: string, width: number) => void;
}
const ResizeContext = React.createContext<ResizeContextValue | null>(null);

interface ResizableSortableHeaderProps extends React.HTMLAttributes<HTMLTableCellElement> {
  'data-col-key'?: string;
}

const ResizableSortableHeader: React.FC<ResizableSortableHeaderProps> = (props) => {
  const colKey = props['data-col-key'];
  const ctx = React.useContext(ResizeContext);
  const colWidth = colKey && ctx ? ctx.widths[colKey] : undefined;
  const onResize = ctx?.onResize;

  // Strip the sentinel attr before it reaches the DOM.
  const cleanProps: React.HTMLAttributes<HTMLTableCellElement> = { ...props };
  delete (cleanProps as any)['data-col-key'];

  // Actions is fixed:right; dragging or resizing it fights the sticky
  // positioning. Render a plain th.
  if (!colKey || colKey === ACTIONS_COLUMN_KEY) {
    return <th {...cleanProps} />;
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: colKey });
  const sortableStyle: React.CSSProperties = {
    ...cleanProps.style,
    transform: CSS.Translate.toString(transform),
    transition,
    cursor: 'grab',
    userSelect: 'none',
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: cleanProps.style?.position ?? 'relative',
  };

  const innerTh = (
    <th
      {...cleanProps}
      ref={setNodeRef}
      style={sortableStyle}
      {...attributes}
      {...listeners}
    />
  );

  // Resize is opt-in per column. If we don't know a width and there's
  // no onResize callback in context, skip the wrapper.
  if (!colWidth || !onResize) {
    return innerTh;
  }

  return (
    <Resizable
      width={colWidth}
      height={0}
      handle={(
        <span
          className="bom-col-resize-handle"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            right: -4,
            top: 0,
            bottom: 0,
            width: 8,
            cursor: 'col-resize',
            zIndex: 3,
          }}
        />
      )}
      onResize={(_e: React.SyntheticEvent, data: ResizeCallbackData) => {
        onResize(colKey, Math.max(48, data.size.width));
      }}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      {innerTh}
    </Resizable>
  );
};

function loadSavedColumnOrder(userEmail?: string | null): string[] | null {
  if (!userEmail) return null;
  try {
    const raw = localStorage.getItem(COLUMN_ORDER_STORAGE_PREFIX + userEmail.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : null;
  } catch {
    return null;
  }
}

function saveColumnOrder(userEmail: string | null | undefined, keys: string[]): void {
  if (!userEmail) return;
  try {
    localStorage.setItem(COLUMN_ORDER_STORAGE_PREFIX + userEmail.toLowerCase(), JSON.stringify(keys));
  } catch {
    // localStorage full or disabled; silently degrade — order just won't persist.
  }
}

function loadSavedColumnWidths(userEmail?: string | null): Record<string, number> {
  if (!userEmail) return {};
  try {
    const raw = localStorage.getItem(COLUMN_WIDTH_STORAGE_PREFIX + userEmail.toLowerCase());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveColumnWidths(userEmail: string | null | undefined, widths: Record<string, number>): void {
  if (!userEmail) return;
  try {
    localStorage.setItem(COLUMN_WIDTH_STORAGE_PREFIX + userEmail.toLowerCase(), JSON.stringify(widths));
  } catch {
    // localStorage full/disabled — degrade silently.
  }
}

// Two-digit-year date formatter for grid display. The full ISO timestamps
// burn horizontal space we'd rather give to Title.
function formatGridDate(v: string | null | undefined): string {
  if (!v) return '-';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '-';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

// Builds a value-aware sorter for any column. String values compare
// case-insensitively; numbers numerically; everything else by toString.
function makeSorter<T>(getValue: (row: T) => unknown) {
  return (a: T, b: T): number => {
    const av = getValue(a);
    const bv = getValue(b);
    if (av == null && bv == null) return 0;
    if (av == null) return -1;
    if (bv == null) return 1;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
  };
}

const escalationStages: { value: EscalationStage; label: string; color: string }[] = [
  { value: 'NONE', label: 'Not escalated', color: 'default' },
  { value: 'SUPER_ADMIN_REVIEW', label: 'Super-admin review', color: 'gold' },
  { value: 'PLATFORM_OWNER_REVIEW', label: 'Platform-owner review', color: 'volcano' },
  { value: 'ASSIGNED_HUMAN', label: 'Assigned (Human)', color: 'green' },
  { value: 'ASSIGNED_CLAUDE', label: 'Assigned (Claude)', color: 'geekblue' },
  { value: 'OWNER_APPROVAL_PENDING', label: 'Owner approval', color: 'purple' },
  { value: 'COMPLETED', label: 'Completed', color: 'success' },
];

const escalationStageMap = Object.fromEntries(
  escalationStages.map((s) => [s.value, s])
) as Record<EscalationStage, { value: EscalationStage; label: string; color: string }>;

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
  const [showClosed, setShowClosed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [stageFilter, setStageFilter] = useState<EscalationStage | undefined>();
  const [videoModal, setVideoModal] = useState<number | null>(null);
  const [videoSasUrl, setVideoSasUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [resolveModal, setResolveModal] = useState<Ticket | null>(null);
  const [resolution, setResolution] = useState('');
  const [activeTabByTicket, setActiveTabByTicket] = useState<Record<number, string>>({});

  const currentUser: AuthUser = JSON.parse(localStorage.getItem('bom_user') || '{}');

  // Drag-to-reorder state for the tickets grid columns. Initial value is
  // whatever the user saved last session; null = use whatever order
  // the columns array is built in below. The order is recomputed each
  // render against the live columns (so newly-introduced columns just
  // append at the end).
  const [columnOrder, setColumnOrder] = useState<string[] | null>(() =>
    loadSavedColumnOrder(currentUser?.email ?? null),
  );
  // Per-column widths, also persisted per user. Override ResizableSortableHeader's
  // default fall-back when present.
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() =>
    loadSavedColumnWidths(currentUser?.email ?? null),
  );
  const handleColumnResize = (key: string, width: number) => {
    setColumnWidths((prev) => {
      const next = { ...prev, [key]: width };
      saveColumnWidths(currentUser?.email ?? null, next);
      return next;
    });
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  const refreshTicket = async (ticketId: number) => {
    try {
      const updated = await ticketApi.get(ticketId);
      setTickets((prev) => prev.map((t) => (t.id === ticketId ? updated : t)));
    } catch {
      loadTickets();
    }
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

  // Build distinct-value filter lists from the live dataset so categorical
  // columns get an out-of-the-box filter dropdown without us manually
  // enumerating values.
  const distinct = <K extends keyof Ticket>(key: K): { text: string; value: any }[] => {
    const seen = new Set<string>();
    const out: { text: string; value: any }[] = [];
    for (const t of tickets) {
      const v = t[key];
      if (v == null || v === '') continue;
      const s = String(v);
      if (seen.has(s)) continue;
      seen.add(s);
      out.push({ text: s.replace(/_/g, ' '), value: v });
    }
    return out.sort((a, b) => String(a.text).localeCompare(String(b.text)));
  };

  // Every column gets sorter + (where it makes sense) filters. Most carry
  // no fixed width — antd auto-sizes them. The Selects need explicit
  // widths and the fixed Actions column is excluded from sortable/resizable.
  const columns: any[] = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      sorter: makeSorter<Ticket>((t) => t.id),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      sorter: makeSorter<Ticket>((t) => t.title),
    },
  ];

  // Host app chip — always visible, not just on the "all" view. Devs
  // should see which Managed app a ticket came from at a glance.
  columns.push({
    title: 'Host App',
    dataIndex: 'projectId',
    key: 'application',
    sorter: makeSorter<Ticket>((t) => projectMap[t.projectId] ?? ''),
    filters: Array.from(new Set(tickets.map((t) => t.projectId)))
      .map((id) => ({ text: projectMap[id] || `Project ${id}`, value: id }))
      .sort((a, b) => String(a.text).localeCompare(String(b.text))),
    onFilter: (value: any, record: Ticket) => record.projectId === value,
    render: (v: number) => <Tag icon={<AppstoreOutlined />} color="cyan">{projectMap[v] || `Project ${v}`}</Tag>,
  });

  columns.push(
    {
      title: 'Type',
      dataIndex: 'ticketType',
      key: 'ticketType',
      sorter: makeSorter<Ticket>((t) => t.ticketType),
      filters: distinct('ticketType'),
      onFilter: (value: any, record: Ticket) => record.ticketType === value,
      render: (v: string) => {
        // Default Tag (no color prop) renders dark-grey on a dark background and
        // disappears in this theme. Color-code by type so the badge is legible.
        // Three distinct hues — keeping these separate from Host App's cyan
        // and Priority's blue family so a row scans by hue.
        const color = v === 'BUG' ? 'volcano' : v === 'FEATURE_REQUEST' ? 'geekblue' : 'magenta';
        return <Tag color={color}>{v.replace('_', ' ')}</Tag>;
      },
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      sorter: (a: Ticket, b: Ticket) => {
        const o: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
        return (o[a.priority] ?? 0) - (o[b.priority] ?? 0);
      },
      filters: distinct('priority'),
      onFilter: (value: any, record: Ticket) => record.priority === value,
      render: (v: string) => <Tag color={priorityColors[v]}>{v}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      sorter: makeSorter<Ticket>((t) => t.status),
      filters: distinct('status'),
      onFilter: (value: any, record: Ticket) => record.status === value,
      render: (v: string, record: Ticket) => (
        <Select
          value={v}
          size="small"
          style={{ width: 144 }}
          onChange={(val) => handleStatusChange(record.id, val)}
          options={statuses.map((s) => ({ label: s.replace(/_/g, ' '), value: s }))}
        />
      ),
    },
    {
      title: 'Escalation',
      dataIndex: 'escalationStage',
      key: 'escalationStage',
      filters: escalationStages.map((s) => ({ text: s.label, value: s.value })),
      onFilter: (value: any, record: Ticket) => (record.escalationStage || 'NONE') === value,
      sorter: (a: Ticket, b: Ticket) => {
        const order: Record<string, number> = {
          NONE: 0,
          SUPER_ADMIN_REVIEW: 1,
          PLATFORM_OWNER_REVIEW: 2,
          ASSIGNED_HUMAN: 3,
          ASSIGNED_CLAUDE: 3,
          OWNER_APPROVAL_PENDING: 4,
          COMPLETED: 5,
        };
        return (order[a.escalationStage || 'NONE'] ?? 0) - (order[b.escalationStage || 'NONE'] ?? 0);
      },
      render: (v: EscalationStage | undefined) => {
        const stage = (v || 'NONE') as EscalationStage;
        const meta = escalationStageMap[stage];
        const icon = stage === 'ASSIGNED_CLAUDE' ? <RobotOutlined /> : undefined;
        return <Tag color={meta.color} icon={icon}>{meta.label}</Tag>;
      },
    },
  );

  // Tenant columns — only show if data exists
  const hasTenantData = tickets.some(t => t.tenantName || t.tenantId);
  if (hasTenantData) {
    columns.push({
      title: 'Tenant',
      key: 'tenant',
      sorter: makeSorter<Ticket>((t) => t.tenantName || t.tenantId || ''),
      filters: Array.from(new Set(tickets.map((t) => t.tenantName || t.tenantId).filter(Boolean)))
        .map((v) => ({ text: String(v), value: String(v) }))
        .sort((a, b) => a.text.localeCompare(b.text)),
      onFilter: (value: any, record: Ticket) =>
        (record.tenantName || record.tenantId) === value,
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
      sorter: makeSorter<Ticket>((t) => t.databaseName ?? ''),
      filters: distinct('databaseName'),
      onFilter: (value: any, record: Ticket) => record.databaseName === value,
      render: (_: any, record: Ticket) =>
        record.databaseName ? <Tag icon={<DatabaseOutlined />}>{record.databaseName}</Tag> : '-',
    });
  }

  const hasEnvData = tickets.some(t => t.environment);
  if (hasEnvData) {
    columns.push({
      title: 'Env',
      key: 'environment',
      sorter: makeSorter<Ticket>((t) => t.environment ?? ''),
      filters: distinct('environment'),
      onFilter: (value: any, record: Ticket) => record.environment === value,
      render: (_: any, record: Ticket) => {
        if (!record.environment) return '-';
        const envColor = record.environment === 'PRODUCTION' ? 'red' : record.environment === 'STAGING' ? 'orange' : 'green';
        return <Tag icon={<CloudOutlined />} color={envColor}>{record.environment}</Tag>;
      },
    });
  }

  // Console/Network error indicator column was removed — the row was
  // dominated by colored badges and the actual error text already
  // surfaces in the expanded Details panel where it's actionable.

  // Developer Category column — kept on a fixed width because the inner
  // Select can't auto-size without help.
  columns.push({
    title: 'Dev Category',
    dataIndex: 'developerCategory',
    key: 'developerCategory',
    width: 180,
    sorter: makeSorter<Ticket>((t) => t.developerCategory ?? ''),
    filters: distinct('developerCategory'),
    onFilter: (value: any, record: Ticket) => record.developerCategory === value,
    render: (v: string, record: Ticket) => (
      <Select
        value={v || undefined}
        size="small"
        style={{ width: 160 }}
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
    {
      title: 'Submitted By',
      dataIndex: 'submittedBy',
      key: 'submittedBy',
      ellipsis: true,
      sorter: makeSorter<Ticket>((t) => t.submittedBy ?? ''),
      filters: distinct('submittedBy'),
      onFilter: (value: any, record: Ticket) => record.submittedBy === value,
    },
    {
      title: 'Assigned Developer',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      width: 230,
      // ellipsis prevents content from spilling under the pinned Actions
      // column — without it, the "No * devs" Tag overflowed visually and
      // the Resolve button sat on top of it.
      ellipsis: true,
      sorter: makeSorter<Ticket>((t) => t.assignedTo ?? ''),
      filters: distinct('assignedTo'),
      onFilter: (value: any, record: Ticket) => record.assignedTo === value,
      render: (v: string, record: Ticket) => {
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

        // No eligible devs → render a compact warning Tag (was a disabled
        // Select with near-invisible placeholder text). Wrapped in a
        // 190px box with overflow:hidden so it can't bleed into the next
        // column.
        if (eligible.length === 0 && cat) {
          return (
            <div style={{ maxWidth: 190, overflow: 'hidden' }}>
              <Tag
                color="warning"
                style={{
                  fontSize: 12,
                  margin: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block',
                }}
              >
                No {cat.toLowerCase()} devs
              </Tag>
            </div>
          );
        }

        return (
          <Select
            value={v || undefined}
            size="small"
            style={{ width: 190 }}
            placeholder={placeholder}
            allowClear
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
      sorter: (a: Ticket, b: Ticket) => {
        const av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return av - bv;
      },
      render: (v: string) => formatGridDate(v),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_: any, record: Ticket) => (
        <Space size="small">
          {record.videoUrl && (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              loading={videoLoading && videoModal === record.id}
              onClick={async () => {
                setVideoModal(record.id);
                setVideoSasUrl(null);
                setVideoLoading(true);
                try {
                  const url = await ticketApi.getVideoUrl(record.id);
                  setVideoSasUrl(url);
                } finally {
                  setVideoLoading(false);
                }
              }}
            >
              Video
            </Button>
          )}
          <Button
            size="small"
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={() => setResolveModal(record)}
          >
            Resolve
          </Button>
        </Space>
      ),
    },
  );

  const projectOptions: any[] = [];
  if (isPlatformAdmin || projects.length > 1) {
    projectOptions.push({ label: 'All Applications', value: 'all' });
  }
  projects.forEach((p) => projectOptions.push({ label: p.name, value: p.id }));

  // Apply the user's saved column order on top of the live columns
  // array. Columns the user hasn't seen before (e.g. Tenant only
  // appears once tickets carry tenant data) just append at the end so
  // they're discoverable. The Actions column is forced to the end so
  // the fixed:right pinning still works.
  const orderedColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key as string, c]));
    const result: any[] = [];
    if (columnOrder) {
      for (const k of columnOrder) {
        if (k === ACTIONS_COLUMN_KEY) continue;
        const c = byKey.get(k);
        if (c) {
          result.push(c);
          byKey.delete(k);
        }
      }
    }
    for (const c of columns) {
      if (c.key === ACTIONS_COLUMN_KEY) continue;
      if (byKey.has(c.key)) {
        result.push(c);
        byKey.delete(c.key);
      }
    }
    const actionsCol = columns.find((c) => c.key === ACTIONS_COLUMN_KEY);
    if (actionsCol) result.push(actionsCol);
    return result;
  }, [columns, columnOrder]);

  const draggableKeys = orderedColumns
    .filter((c) => c.key !== ACTIONS_COLUMN_KEY)
    .map((c) => c.key as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeKey = String(active.id);
    const overKey = String(over.id);
    if (activeKey === ACTIONS_COLUMN_KEY || overKey === ACTIONS_COLUMN_KEY) return;
    const oldIdx = draggableKeys.indexOf(activeKey);
    const newIdx = draggableKeys.indexOf(overKey);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(draggableKeys, oldIdx, newIdx);
    // Append actions at the end so the persisted order matches what
    // we render (fixed:right Actions is always last).
    const fullOrder = [...reordered, ACTIONS_COLUMN_KEY];
    setColumnOrder(fullOrder);
    saveColumnOrder(currentUser?.email ?? null, fullOrder);
  };

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
          <Select
            value={stageFilter}
            onChange={(v) => setStageFilter(v as EscalationStage | undefined)}
            style={{ width: 200 }}
            placeholder="All Escalation Stages"
            allowClear
            options={escalationStages.map((s) => ({ label: s.label, value: s.value }))}
          />
          <Checkbox checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)}>
            Show closed
          </Checkbox>
        </Space>
      </div>

      <ResizeContext.Provider value={{ widths: columnWidths, onResize: handleColumnResize }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={draggableKeys} strategy={horizontalListSortingStrategy}>
      <Table
        dataSource={(() => {
          let rows = showClosed ? tickets : tickets.filter((t) => t.status !== 'CLOSED');
          if (stageFilter) rows = rows.filter((t) => (t.escalationStage || 'NONE') === stageFilter);
          return rows;
        })()}
        // onHeaderCell only attaches the column key as a string data
        // attr — width and resize handler come from ResizeContext so we
        // never put functions on DOM nodes (antd's column validator
        // chokes on that).
        columns={orderedColumns.map((c: any) => {
          const savedW = columnWidths[c.key as string];
          const effectiveW = savedW ?? c.width;
          return {
            ...c,
            width: effectiveW,
            onHeaderCell: () => ({ 'data-col-key': c.key }),
          };
        })}
        rowKey="id"
        loading={loading}
        size="small"
        // Horizontal scroll when columns exceed viewport, but Actions
        // stays pinned to the right edge (`fixed: 'right'`) so the
        // primary action is always reachable without scrolling.
        scroll={{ x: 'max-content' }}
        components={{
          header: {
            cell: ResizableSortableHeader,
          },
        }}
        expandable={{
          expandedRowRender: (record) => {
            const detailsContent = (
              <div>
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
                  <Text type="secondary"><PlayCircleOutlined /> Screen recording attached — click Video in the actions column to play.</Text>
                )}
              </Space>
              </div>
            );

            const chatContent = (
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
            );

            const activeTab = activeTabByTicket[record.id] || 'details';

            return (
              <Card size="small" style={{ background: '#141414' }}>
                <EscalationPanel
                  ticket={record}
                  currentUser={currentUser}
                  onChanged={() => refreshTicket(record.id)}
                  onAssignedToClaude={() =>
                    setActiveTabByTicket((prev) => ({ ...prev, [record.id]: 'claude' }))
                  }
                />
                <Divider style={{ margin: '8px 0 12px' }} />
                <Tabs
                  activeKey={activeTab}
                  onChange={(key) => setActiveTabByTicket((prev) => ({ ...prev, [record.id]: key }))}
                  size="small"
                  items={[
                    { key: 'details', label: 'Details', children: detailsContent },
                    { key: 'chat', label: 'Chat', children: chatContent },
                    {
                      key: 'claude',
                      label: (<span><RobotOutlined /> Claude Activity</span>),
                      children: <ClaudeActivityTab ticketId={record.id} active={activeTab === 'claude'} />,
                    },
                  ]}
                />
              </Card>
            );
          },
          onExpand: (expanded, record) => {
            if (expanded && !notesMap[record.id]) {
              loadNotes(record.id);
            }
          },
        }}
        pagination={{ pageSize: 20 }}
      />
        </SortableContext>
      </DndContext>
      </ResizeContext.Provider>

      {/* Video Modal */}
      <Modal
        title="Screen Recording"
        open={videoModal !== null}
        onCancel={() => { setVideoModal(null); setVideoSasUrl(null); }}
        footer={null}
        width={800}
      >
        {videoLoading && <div style={{ textAlign: 'center', padding: 32 }}>Loading video…</div>}
        {videoSasUrl && (
          <video
            src={videoSasUrl}
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
