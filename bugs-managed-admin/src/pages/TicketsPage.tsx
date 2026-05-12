import React, { useEffect, useMemo, useState } from 'react';
import { Table, Select, Tag, Button, Modal, Input, Space, Typography, Card, message, Tabs, Divider, Checkbox, Segmented, DatePicker, Upload, Image } from 'antd';
import type { UploadFile } from 'antd';
import dayjs from 'dayjs';
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
  DownloadOutlined,
  ShareAltOutlined,
  CalendarOutlined,
  TableOutlined,
  AppstoreAddOutlined,
  PaperClipOutlined,
  PictureOutlined,
  HistoryOutlined,
  CheckSquareOutlined,
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
import { projectApi, ticketApi, ticketAssignApi, noteApi, teamApi, labelApi, checklistApi, attachmentApi, statusApi, type Project, type Ticket, type TicketNote, type TeamMember, type AuthUser, type EscalationStage, type TicketLabel, type TicketStatusDef } from '../api';
import EscalationPanel from '../components/EscalationPanel';
import ClaudeActivityTab from '../components/ClaudeActivityTab';
import LabelChips from '../components/LabelChips';
import ChecklistPanel from '../components/ChecklistPanel';
import TicketActivityTab from '../components/TicketActivityTab';
import KanbanBoard from '../components/KanbanBoard';
import CalendarView from '../components/CalendarView';

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
  // Filter selects are multi-select. Empty array = no filter on that
  // axis (i.e. all values pass). Lets the user say "show me everything
  // except RESOLVED and CLOSED" by checking the 5 statuses they want.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [stageFilter, setStageFilter] = useState<EscalationStage[]>([]);
  // Assigned-developer multi-select. Empty = no filter. "__unassigned__"
  // is a sentinel that picks tickets with no assignee — surfaces the
  // tickets waiting for someone to be put on them.
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  // Labels filter. Multi-select of label IDs; a ticket passes when it
  // has at least one of the picked labels attached (OR semantics — most
  // useful for "show me everything tagged 'regression' OR 'customer-blocked'").
  const [labelFilter, setLabelFilter] = useState<number[]>([]);
  // Sort applied to the unified ticket list before it hits Table / Board /
  // Calendar. Table users can still click a column header to override this,
  // but Board + Calendar respect it as their only ordering signal.
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(() => {
    const saved = localStorage.getItem('bom-tickets-sort');
    return (saved === 'oldest' ? 'oldest' : 'newest');
  });
  useEffect(() => { localStorage.setItem('bom-tickets-sort', sortOrder); }, [sortOrder]);
  const [videoModal, setVideoModal] = useState<number | null>(null);
  const [videoSasUrl, setVideoSasUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState<number | null>(null);
  const [shareLoading, setShareLoading] = useState<number | null>(null);
  const [resolveModal, setResolveModal] = useState<Ticket | null>(null);
  const [resolution, setResolution] = useState('');
  const [activeTabByTicket, setActiveTabByTicket] = useState<Record<number, string>>({});

  // View mode: classic Table, Trello-style Board, or Calendar by due date.
  // Persisted per-user so the choice survives reloads.
  const [viewMode, setViewMode] = useState<'table' | 'board' | 'calendar'>(() => {
    const saved = localStorage.getItem('bom-tickets-view-mode');
    return (saved as any) || 'table';
  });
  useEffect(() => { localStorage.setItem('bom-tickets-view-mode', viewMode); }, [viewMode]);

  // Per-ticket labels and checklist progress. Loaded in bulk after the
  // ticket list comes back so cards and rows render label chips + progress
  // without a per-card round trip.
  const [orgLabels, setOrgLabels] = useState<TicketLabel[]>([]);
  // Per-org status dictionary. Drives the Status select on rows and the
  // Kanban columns, replacing the hardcoded list. Auto-seeded server-side
  // on first read.
  const [orgStatuses, setOrgStatuses] = useState<TicketStatusDef[]>([]);
  const [labelsByTicket, setLabelsByTicket] = useState<Record<number, TicketLabel[]>>({});
  const [checklistByTicket, setChecklistByTicket] = useState<Record<number, { done: number; total: number }>>({});

  // Chat: pending screenshot upload per ticket. Files queued here are
  // uploaded after the note POST succeeds, then attached to that note.
  const [chatScreenshots, setChatScreenshots] = useState<Record<number, File[]>>({});
  const [attachmentsByNote, setAttachmentsByNote] = useState<Record<number, { id: number; fileName: string }[]>>({});
  const [attachmentUrlCache, setAttachmentUrlCache] = useState<Record<number, string>>({});

  // Modal-mode ticket detail. Board view clicks open this rather than
  // switching to the table — the user wants to stay on the board and
  // work the ticket in a popup.
  const [modalTicket, setModalTicket] = useState<Ticket | null>(null);

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
    // Server accepts comma-separated lists. An empty array means "no
    // filter on this axis" so we send undefined in that case.
    const statusCsv = statusFilter.length > 0 ? statusFilter.join(',') : undefined;
    const typeCsv = typeFilter.length > 0 ? typeFilter.join(',') : undefined;
    ticketApi.list(projectId || undefined, statusCsv, typeCsv)
      .then(setTickets)
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (selectedProject) loadTickets(); }, [selectedProject, statusFilter, typeFilter]);

  // Org-level label dictionary — loaded once for the page so attach/detach
  // menus have something to choose from.
  useEffect(() => {
    labelApi.list().then(setOrgLabels).catch(() => {});
    statusApi.list().then(setOrgStatuses).catch(() => {});
  }, []);

  // Closed-like keys: derived from the dictionary so a renamed/added
  // terminal status (e.g. "WONT_FIX") still hides under "Show closed".
  const closedLikeKeys = useMemo(
    () => new Set(orgStatuses.filter((s) => s.isClosedLike).map((s) => s.key)),
    [orgStatuses],
  );

  // After tickets land, hydrate label + checklist summaries in parallel.
  // Fire-and-forget — failures degrade gracefully (chips just don't render).
  useEffect(() => {
    if (tickets.length === 0) {
      setLabelsByTicket({});
      setChecklistByTicket({});
      return;
    }
    let cancelled = false;
    Promise.all(tickets.map((t) =>
      Promise.all([
        labelApi.listForTicket(t.id).catch(() => [] as TicketLabel[]),
        checklistApi.list(t.id).catch(() => []),
      ]).then(([labels, items]) => ({
        id: t.id,
        labels,
        done: items.filter((i) => i.isDone).length,
        total: items.length,
      }))
    )).then((rows) => {
      if (cancelled) return;
      const lbm: Record<number, TicketLabel[]> = {};
      const ckm: Record<number, { done: number; total: number }> = {};
      for (const r of rows) {
        lbm[r.id] = r.labels;
        ckm[r.id] = { done: r.done, total: r.total };
      }
      setLabelsByTicket(lbm);
      setChecklistByTicket(ckm);
    });
    return () => { cancelled = true; };
  }, [tickets]);

  const reloadLabelsForTicket = async (ticketId: number) => {
    try {
      const labels = await labelApi.listForTicket(ticketId);
      setLabelsByTicket((prev) => ({ ...prev, [ticketId]: labels }));
    } catch {}
  };

  // Single client-side filter pipeline so Table, Board and Calendar all
  // honour the same toolbar selects. Status + type happen server-side
  // (see ticketApi.list); stage + showClosed run here because they need
  // a re-derived list when the user toggles them without refetching.
  const visibleTickets = useMemo(() => {
    let rows = showClosed ? tickets : tickets.filter((t) => !closedLikeKeys.has(t.status));
    if (stageFilter.length > 0) {
      const set = new Set(stageFilter);
      rows = rows.filter((t) => set.has((t.escalationStage || 'NONE') as EscalationStage));
    }
    if (assigneeFilter.length > 0) {
      const set = new Set(assigneeFilter);
      rows = rows.filter((t) => {
        if (!t.assignedTo) return set.has('__unassigned__');
        return set.has(t.assignedTo);
      });
    }
    if (labelFilter.length > 0) {
      const set = new Set(labelFilter);
      rows = rows.filter((t) => {
        const attached = labelsByTicket[t.id] || [];
        return attached.some((l) => set.has(l.id));
      });
    }
    // Sort by submitted (= createdAt) date. Copy first — `.sort` mutates,
    // and `rows` may still alias `tickets` if no filter trimmed it.
    rows = [...rows].sort((a, b) => {
      const av = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bv = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === 'newest' ? bv - av : av - bv;
    });
    return rows;
  }, [tickets, showClosed, stageFilter, assigneeFilter, labelFilter, labelsByTicket, closedLikeKeys, sortOrder]);

  const handleDueDateChange = async (ticketId: number, date: dayjs.Dayjs | null) => {
    try {
      await ticketApi.setDueDate(ticketId, date ? date.toISOString() : null);
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, dueDate: date ? date.toISOString() : null } : t));
    } catch {
      message.error('Failed to update due date');
    }
  };

  const loadNoteAttachments = async (ticketId: number) => {
    try {
      const all = await attachmentApi.list(ticketId);
      const byNote: Record<number, { id: number; fileName: string }[]> = {};
      for (const a of all) {
        if (a.noteId == null) continue;
        (byNote[a.noteId] ??= []).push({ id: a.id, fileName: a.fileName });
      }
      setAttachmentsByNote(byNote);
    } catch {}
  };

  const handleAttachmentClick = async (ticketId: number, attachmentId: number) => {
    let url = attachmentUrlCache[attachmentId];
    if (!url) {
      try {
        url = await attachmentApi.getUrl(ticketId, attachmentId);
        setAttachmentUrlCache((prev) => ({ ...prev, [attachmentId]: url }));
      } catch {
        message.error('Failed to load screenshot');
        return;
      }
    }
    window.open(url, '_blank');
  };

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
    const pending = chatScreenshots[ticketId] || [];
    if (!content && pending.length === 0) return;
    const type = noteType[ticketId] || 'COMMENT';
    const created = await noteApi.add(ticketId, content || '(screenshot)', type);
    // Upload any queued screenshots and link them to the new note.
    for (const file of pending) {
      try {
        await attachmentApi.upload(ticketId, file, created.id);
      } catch {
        message.warning(`Screenshot ${file.name} failed to upload`);
      }
    }
    setNoteInput(prev => ({ ...prev, [ticketId]: '' }));
    setChatScreenshots(prev => ({ ...prev, [ticketId]: [] }));
    loadNotes(ticketId);
    loadNoteAttachments(ticketId);
    message.success('Note added');
  };

  // Clipboard paste handler — pasting an image while focused on the chat
  // textarea queues it for upload with the next note send.
  const handleChatPaste = (ticketId: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const images = items
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f != null);
    if (images.length === 0) return;
    e.preventDefault();
    setChatScreenshots(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] || []), ...images] }));
    message.success(`Queued ${images.length} screenshot(s)`);
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

  const handleVideoDownload = async (ticketId: number) => {
    setDownloadLoading(ticketId);
    try {
      const url = await ticketApi.getVideoUrl(ticketId);
      // Fetch as blob so the cross-origin SAS URL triggers a real download
      // instead of opening in a new tab.
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `bug-recording-${ticketId}.webm`;
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch {
      message.error('Failed to download video');
    } finally {
      setDownloadLoading(null);
    }
  };

  const handleVideoShare = async (ticketId: number) => {
    setShareLoading(ticketId);
    try {
      const url = await ticketApi.getVideoUrl(ticketId);
      await navigator.clipboard.writeText(url);
      message.success('Video link copied to clipboard — valid for 1 hour');
    } catch {
      message.error('Failed to copy link');
    } finally {
      setShareLoading(null);
    }
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
          style={{ width: 160 }}
          onChange={(val) => handleStatusChange(record.id, val)}
          options={orgStatuses.map((s) => ({ label: s.displayName, value: s.key }))}
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
        // Anyone on the team is assignable, project-scoped only.
        // Role-gating was eliminating VIEWER users that the platform
        // owner actually wanted to put work on; role is about
        // *authorization*, not "who is responsible for this ticket".
        const eligible = teamMembers.filter((m) => {
          const projectId = record.projectId;
          if (m.projectIds && m.projectIds.length > 0 && projectId) {
            if (!m.projectIds.includes(projectId)) return false;
          }
          return true;
        });

        return (
          <Select
            value={v || undefined}
            size="small"
            style={{ width: 190 }}
            placeholder={eligible.length === 0 ? 'No developers in project' : 'Unassigned'}
            allowClear
            onChange={(val) => handleAssign(record.id, val || '')}
            options={eligible.map((m) => ({
              label: `${m.fullName}${m.specialty ? ` · ${m.specialty}` : ''}`,
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
      title: 'Labels',
      key: 'labels',
      width: 220,
      render: (_: any, record: Ticket) => (
        <LabelChips
          ticketId={record.id}
          attached={labelsByTicket[record.id] || []}
          available={orgLabels}
          allowCreate
          compact
          onChange={() => {
            reloadLabelsForTicket(record.id);
            labelApi.list().then(setOrgLabels).catch(() => {});
          }}
        />
      ),
    },
    {
      title: 'Due',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 150,
      sorter: (a: Ticket, b: Ticket) => {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return av - bv;
      },
      render: (v: string | null | undefined, record: Ticket) => {
        const overdue = v
          && new Date(v).getTime() < Date.now()
          && record.status !== 'RESOLVED' && record.status !== 'CLOSED';
        return (
          <DatePicker
            size="small"
            value={v ? dayjs(v) : null}
            onChange={(d) => handleDueDateChange(record.id, d)}
            allowClear
            placeholder="No due date"
            suffixIcon={<CalendarOutlined style={{ color: overdue ? '#ef4444' : undefined }} />}
            style={{
              width: 130,
              borderColor: overdue ? '#ef4444' : undefined,
            }}
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
      width: 220,
      fixed: 'right',
      render: (_: any, record: Ticket) => (
        <Space size="small" wrap>
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
          {record.videoUrl && (
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={downloadLoading === record.id}
              onClick={() => handleVideoDownload(record.id)}
            >
              Download
            </Button>
          )}
          {record.videoUrl && (
            <Button
              size="small"
              icon={<ShareAltOutlined />}
              loading={shareLoading === record.id}
              onClick={() => handleVideoShare(record.id)}
            >
              Share
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

  // Ticket detail surface — used both by the table's expanded row (inline)
  // and by the Board card popup (modal). One source of truth so chat,
  // checklist, activity, and Claude tabs behave identically in both
  // contexts.
  const renderTicketDetail = (record: Ticket) => {
    const detailsContent = (
      <div>
        {record.description && (
          <div style={{ marginBottom: 12 }}>
            <Text strong>Description:</Text>
            <p>{record.description}</p>
          </div>
        )}
        {record.transcript && (
          <div style={{ marginBottom: 12 }}>
            <Text strong>Voice Transcript:</Text>
            <p style={{ fontStyle: 'italic' }}>{record.transcript}</p>
          </div>
        )}
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
        {record.consoleErrors && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ color: '#e53935' }}><WarningOutlined /> Console Errors:</Text>
            <div style={{ marginTop: 4 }}>{renderConsoleErrors(record.consoleErrors)}</div>
          </div>
        )}
        {record.networkErrors && (
          <div style={{ marginBottom: 12 }}>
            <Text strong style={{ color: '#ff9800' }}><ApiOutlined /> Network Errors:</Text>
            <div style={{ marginTop: 4 }}>{renderNetworkErrors(record.networkErrors)}</div>
          </div>
        )}
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {record.currentPageUrl && <Text type="secondary">Page: {record.currentPageUrl}</Text>}
          {record.browserInfo && <Text type="secondary">Browser: {record.browserInfo?.slice(0, 80)}...</Text>}
          {record.screenWidth && <Text type="secondary">Screen: {record.screenWidth}x{record.screenHeight}</Text>}
          {record.resolution && <Text type="success">Resolution: {record.resolution}</Text>}
          {record.videoUrl && (
            <Text type="secondary"><PlayCircleOutlined /> Screen recording attached — open the Video action on this ticket to play it.</Text>
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
                        {(attachmentsByNote[note.id] || []).length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            {(attachmentsByNote[note.id] || []).map((a) => (
                              <Tag
                                key={a.id}
                                color="purple"
                                onClick={() => handleAttachmentClick(record.id, a.id)}
                                style={{ cursor: 'pointer' }}
                              >
                                <PaperClipOutlined /> {a.fileName}
                              </Tag>
                            ))}
                          </div>
                        )}
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
              <Upload.Dragger
                accept="*/*"
                showUploadList={false}
                openFileDialogOnClick={false}
                beforeUpload={(file) => {
                  setChatScreenshots(prev => ({ ...prev, [record.id]: [...(prev[record.id] || []), file as File] }));
                  return false;
                }}
                multiple
                style={{ flex: 1, padding: 0 }}
              >
                <TextArea
                  value={noteInput[record.id] || ''}
                  onChange={(e) => setNoteInput(prev => ({ ...prev, [record.id]: e.target.value }))}
                  onPaste={(e) => handleChatPaste(record.id, e)}
                  placeholder="Add a note... (type @name to mention, paste or drop a file to attach)"
                  rows={1}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  style={{ flex: 1 }}
                  size="small"
                />
              </Upload.Dragger>
              <Upload
                accept="*/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  setChatScreenshots(prev => ({ ...prev, [record.id]: [...(prev[record.id] || []), file as File] }));
                  return false;
                }}
                multiple
              >
                <Button size="small" icon={<PaperClipOutlined />} title="Attach file" />
              </Upload>
              <Button
                type="primary"
                size="small"
                icon={<SendOutlined />}
                onClick={() => handleAddNote(record.id)}
                disabled={!noteInput[record.id]?.trim() && (chatScreenshots[record.id]?.length ?? 0) === 0}
              >
                Add
              </Button>
            </div>
            {(chatScreenshots[record.id]?.length ?? 0) > 0 && (
              <div style={{ marginTop: 6 }}>
                {(chatScreenshots[record.id] || []).map((f, i) => (
                  <Tag
                    key={i}
                    color="purple"
                    closable
                    onClose={() => setChatScreenshots(prev => ({
                      ...prev,
                      [record.id]: (prev[record.id] || []).filter((_, idx) => idx !== i),
                    }))}
                  >
                    <PaperClipOutlined /> {f.name || 'file'}
                  </Tag>
                ))}
              </div>
            )}
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

        {/* Edit bar — same fields the table exposes as columns, but
            usable from the Board / Calendar modal (where there's no
            row to surface them). Filtering the assignee list mirrors
            the Assigned Developer column: only DEVELOPER /
            PLATFORM_OWNER / SUPER_ADMIN, scoped to this project, and
            matching the dev category if one is set. */}
        {(() => {
          // Anyone on the team is assignable, project-scoped only.
          // Was previously gated by role+specialty which left users
          // staring at a dropdown of just owners/admins.
          const eligible = teamMembers.filter((m) => {
            if (m.projectIds && m.projectIds.length > 0 && record.projectId) {
              if (!m.projectIds.includes(record.projectId)) return false;
            }
            return true;
          });
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Status</Text>
                <Select
                  size="small"
                  value={record.status}
                  style={{ width: 180 }}
                  onChange={(val) => handleStatusChange(record.id, val)}
                  options={orgStatuses.map((s) => ({ label: s.displayName, value: s.key }))}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Assignee</Text>
                {(() => {
                  // Build options from eligible devs, but if the ticket is
                  // currently assigned to someone outside that filter (e.g.
                  // dev-category changed after assignment, or claude
                  // pseudo-user), prepend a synthetic option so the Select
                  // displays their name rather than the raw email.
                  const baseOptions = eligible.map((m) => ({
                    label: `${m.fullName}${m.specialty === 'FULLSTACK' ? ' (FS)' : ''}`,
                    value: m.email,
                  }));
                  const currentInOptions = !!record.assignedTo
                    && baseOptions.some((o) => o.value === record.assignedTo);
                  let options = baseOptions;
                  if (record.assignedTo && !currentInOptions) {
                    const member = teamMembers.find((m) => m.email === record.assignedTo);
                    const label = member?.fullName ?? record.assignedTo.split('@')[0];
                    options = [{ label, value: record.assignedTo }, ...baseOptions];
                  }
                  return (
                    <Select
                      size="small"
                      value={record.assignedTo || undefined}
                      style={{ width: 240 }}
                      placeholder={eligible.length === 0 ? 'No developers in this project' : 'Unassigned'}
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      onChange={(val) => handleAssign(record.id, val || '')}
                      options={options}
                    />
                  );
                })()}
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Due date</Text>
                <DatePicker
                  size="small"
                  value={record.dueDate ? dayjs(record.dueDate) : null}
                  onChange={(d) => handleDueDateChange(record.id, d)}
                  allowClear
                  placeholder="No due date"
                  style={{ width: 160 }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>Labels</Text>
                <LabelChips
                  ticketId={record.id}
                  attached={labelsByTicket[record.id] || []}
                  available={orgLabels}
                  allowCreate
                  onChange={() => {
                    reloadLabelsForTicket(record.id);
                    labelApi.list().then(setOrgLabels).catch(() => {});
                  }}
                />
              </div>
            </div>
          );
        })()}

        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTabByTicket((prev) => ({ ...prev, [record.id]: key }))}
          size="small"
          items={[
            { key: 'details', label: 'Details', children: detailsContent },
            { key: 'chat', label: 'Chat', children: chatContent },
            {
              key: 'checklist',
              label: (<span><CheckSquareOutlined /> Checklist</span>),
              children: (
                <ChecklistPanel
                  ticketId={record.id}
                  onProgressChange={(done, total) =>
                    setChecklistByTicket((prev) => ({ ...prev, [record.id]: { done, total } }))
                  }
                />
              ),
            },
            {
              key: 'activity',
              label: (<span><HistoryOutlined /> Activity</span>),
              children: <TicketActivityTab ticketId={record.id} active={activeTab === 'activity'} />,
            },
            {
              key: 'claude',
              label: (<span><RobotOutlined /> Claude Activity</span>),
              children: <ClaudeActivityTab ticketId={record.id} active={activeTab === 'claude'} />,
            },
          ]}
        />
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Title level={3} style={{ margin: 0 }}>Tickets</Title>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as 'table' | 'board' | 'calendar')}
            options={[
              { label: 'Table', value: 'table', icon: <TableOutlined /> },
              { label: 'Board', value: 'board', icon: <AppstoreAddOutlined /> },
              { label: 'Calendar', value: 'calendar', icon: <CalendarOutlined /> },
            ]}
          />
        </Space>
        <Space wrap>
          <Select
            value={selectedProject}
            onChange={setSelectedProject}
            style={{ width: 220 }}
            placeholder="Application"
            options={projectOptions}
          />
          {/* Multi-select filters. Empty selection = "all"; the user
              picks which values they want to see and deselects the
              rest. Lets them say "everything except RESOLVED + CLOSED"
              by leaving those two unchecked. */}
          <Select
            mode="multiple"
            allowClear
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as string[])}
            style={{ minWidth: 220, maxWidth: 360 }}
            placeholder="All Statuses"
            maxTagCount={2}
            options={orgStatuses.map((s) => ({ label: s.displayName, value: s.key }))}
          />
          <Select
            mode="multiple"
            allowClear
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as string[])}
            style={{ minWidth: 180, maxWidth: 280 }}
            placeholder="All Types"
            maxTagCount={2}
            options={types.map((t) => ({ label: t.replace('_', ' '), value: t }))}
          />
          <Select
            mode="multiple"
            allowClear
            value={stageFilter}
            onChange={(v) => setStageFilter(v as EscalationStage[])}
            style={{ minWidth: 240, maxWidth: 380 }}
            placeholder="All Escalation Stages"
            maxTagCount={2}
            options={escalationStages.map((s) => ({ label: s.label, value: s.value }))}
          />
          <Select
            mode="multiple"
            allowClear
            value={assigneeFilter}
            onChange={(v) => setAssigneeFilter(v as string[])}
            style={{ minWidth: 220, maxWidth: 360 }}
            placeholder="All Developers"
            maxTagCount={2}
            showSearch
            optionFilterProp="label"
            options={[
              { label: '(Unassigned)', value: '__unassigned__' },
              ...teamMembers.map((m) => ({ label: `${m.fullName} <${m.email}>`, value: m.email })),
            ]}
          />
          <Select
            mode="multiple"
            allowClear
            value={labelFilter}
            onChange={(v) => setLabelFilter(v as number[])}
            style={{ minWidth: 200, maxWidth: 360 }}
            placeholder="All Labels"
            maxTagCount={2}
            showSearch
            optionFilterProp="label"
            options={orgLabels.map((l) => ({
              label: l.name,
              value: l.id,
            }))}
            tagRender={({ value, closable, onClose }) => {
              const l = orgLabels.find((x) => x.id === value);
              if (!l) return <span />;
              const hex = (l.color || '#888').replace('#', '');
              const r = parseInt(hex.slice(0, 2), 16);
              const g = parseInt(hex.slice(2, 4), 16);
              const b = parseInt(hex.slice(4, 6), 16);
              const fg = (r * 299 + g * 587 + b * 114) / 1000 >= 140 ? '#000' : '#fff';
              return (
                <Tag
                  closable={closable}
                  onClose={onClose}
                  color={l.color}
                  style={{ color: fg, marginInlineEnd: 4 }}
                >
                  {l.name}
                </Tag>
              );
            }}
          />
          {/* Sort by submitted (createdAt) date. Applies to Board + Calendar
              always; Table uses it as the initial order but lets the user
              click a column header to re-sort. */}
          <Select
            value={sortOrder}
            onChange={(v) => setSortOrder(v)}
            style={{ width: 200 }}
            options={[
              { label: 'Newest submitted first', value: 'newest' },
              { label: 'Oldest submitted first', value: 'oldest' },
            ]}
          />
          <Checkbox checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)}>
            Show closed
          </Checkbox>
        </Space>
      </div>

      {viewMode === 'board' && (
        <KanbanBoard
          tickets={visibleTickets}
          statuses={showClosed ? orgStatuses : orgStatuses.filter((s) => !s.isClosedLike)}
          labelsByTicket={labelsByTicket}
          checklistByTicket={checklistByTicket}
          projectMap={projectMap}
          teamMembers={teamMembers}
          onAssign={(ticketId, email) => handleAssign(ticketId, email)}
          onCardClick={(ticket) => {
            // Open the same detail surface the table's expanded row uses,
            // but in a modal so the user can keep the Board view behind it.
            if (!notesMap[ticket.id]) {
              loadNotes(ticket.id);
              loadNoteAttachments(ticket.id);
            }
            setModalTicket(ticket);
          }}
          onStatusChange={async (ticketId, status) => {
            await handleStatusChange(ticketId, status);
          }}
        />
      )}

      {viewMode === 'calendar' && (
        <CalendarView
          tickets={visibleTickets}
          onCardClick={(ticket) => {
            if (!notesMap[ticket.id]) {
              loadNotes(ticket.id);
              loadNoteAttachments(ticket.id);
            }
            setModalTicket(ticket);
          }}
        />
      )}

      {viewMode === 'table' && (
      <ResizeContext.Provider value={{ widths: columnWidths, onResize: handleColumnResize }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={draggableKeys} strategy={horizontalListSortingStrategy}>
      <Table
        dataSource={visibleTickets}
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
          expandedRowRender: (record) => renderTicketDetail(record),
          onExpand: (expanded, record) => {
            if (expanded && !notesMap[record.id]) {
              loadNotes(record.id);
              loadNoteAttachments(record.id);
            }
          },
        }}
        pagination={{ pageSize: 20 }}
      />
        </SortableContext>
      </DndContext>
      </ResizeContext.Provider>
      )}

      {/* Ticket detail modal — opened from Board / Calendar card clicks.
          Same content as the table's expanded row, just rendered above
          the board instead of switching views. */}
      <Modal
        open={modalTicket !== null}
        onCancel={() => setModalTicket(null)}
        footer={null}
        width={1040}
        destroyOnClose
        title={modalTicket ? `Ticket #${modalTicket.id} — ${modalTicket.title}` : ''}
      >
        {modalTicket && renderTicketDetail(modalTicket)}
      </Modal>

      {/* Video Modal */}
      <Modal
        title="Screen Recording"
        open={videoModal !== null}
        onCancel={() => { setVideoModal(null); setVideoSasUrl(null); }}
        footer={videoSasUrl && videoModal !== null ? (
          <Space>
            <Button
              icon={<DownloadOutlined />}
              loading={downloadLoading === videoModal}
              onClick={() => handleVideoDownload(videoModal)}
            >
              Download
            </Button>
            <Button
              icon={<ShareAltOutlined />}
              loading={shareLoading === videoModal}
              onClick={() => handleVideoShare(videoModal)}
            >
              Copy link
            </Button>
          </Space>
        ) : null}
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
