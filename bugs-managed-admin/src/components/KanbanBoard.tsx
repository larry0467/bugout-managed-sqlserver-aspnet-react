import React, { useMemo, useState } from 'react';
import { Card, Tag, Typography, Tooltip, Space } from 'antd';
import { CalendarOutlined, AppstoreOutlined, RobotOutlined } from '@ant-design/icons';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { Ticket, TicketLabel, TicketStatusDef } from '../api';

const { Text } = Typography;

// Columns are derived from the per-org status dictionary at runtime — see
// TicketsPage which fetches statusApi.list() and passes them in. One
// column per status so every state has a landing spot (an earlier version
// collapsed several into a single column, which made some statuses
// effectively invisible on the board).

const priorityColors: Record<string, string> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default',
};

interface BoardCardProps {
  ticket: Ticket;
  labels: TicketLabel[];
  checklistTotal: number;
  checklistDone: number;
  hasClaude?: boolean;
  projectName?: string;
  onClick: () => void;
}

const BoardCard: React.FC<BoardCardProps> = ({ ticket, labels, checklistTotal, checklistDone, hasClaude, projectName, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `ticket-${ticket.id}` });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: 'grab',
    marginBottom: 8,
  };

  // Overdue glow: red box-shadow when DueDate is past and ticket isn't resolved/closed.
  const overdue = ticket.dueDate
    && new Date(ticket.dueDate).getTime() < Date.now()
    && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED';

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        size="small"
        onClick={onClick}
        bodyStyle={{ padding: 10 }}
        style={{
          background: '#141414',
          border: overdue ? '1px solid #ef4444' : '1px solid #303030',
          boxShadow: overdue ? '0 0 0 1px rgba(239,68,68,0.25), 0 0 8px rgba(239,68,68,0.35)' : undefined,
        }}
      >
        {/* Label strip across the top */}
        {labels.length > 0 && (
          <div style={{ marginBottom: 6, lineHeight: 1 }}>
            {labels.map((l) => (
              <span
                key={l.id}
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 6,
                  borderRadius: 3,
                  background: l.color,
                  marginRight: 4,
                }}
                title={l.name}
              />
            ))}
          </div>
        )}

        <Text strong style={{ fontSize: 13 }}>{ticket.title}</Text>

        <Space size={4} style={{ marginTop: 6, width: '100%' }} wrap>
          <Tag color={priorityColors[ticket.priority]} style={{ fontSize: 10, margin: 0 }}>{ticket.priority}</Tag>
          {projectName && (
            <Tag icon={<AppstoreOutlined />} color="cyan" style={{ fontSize: 10, margin: 0 }}>{projectName}</Tag>
          )}
          {hasClaude && (
            <Tag icon={<RobotOutlined />} color="geekblue" style={{ fontSize: 10, margin: 0 }}>Claude</Tag>
          )}
          {checklistTotal > 0 && (
            <Tag style={{ fontSize: 10, margin: 0 }} color={checklistDone === checklistTotal ? 'success' : 'default'}>
              {checklistDone}/{checklistTotal}
            </Tag>
          )}
          {ticket.dueDate && (
            <Tooltip title={new Date(ticket.dueDate).toLocaleDateString()}>
              <Tag
                icon={<CalendarOutlined />}
                color={overdue ? 'red' : 'default'}
                style={{ fontSize: 10, margin: 0 }}
              >
                {new Date(ticket.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </Tag>
            </Tooltip>
          )}
        </Space>

        {ticket.assignedTo && (
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>{ticket.assignedTo}</Text>
          </div>
        )}
      </Card>
    </div>
  );
};

const BoardColumn: React.FC<{
  columnKey: string;
  title: string;
  color: string;
  children: React.ReactNode;
  count: number;
}> = ({ columnKey, title, color, children, count }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${columnKey}` });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '1 1 0',
        minWidth: 260,
        background: '#0a0a0a',
        border: `1px solid ${isOver ? color : '#1f1f1f'}`,
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 220px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }} />
        <Text strong>{title}</Text>
        <Tag style={{ marginLeft: 'auto', fontSize: 10 }}>{count}</Tag>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>{children}</div>
    </div>
  );
};

interface KanbanBoardProps {
  tickets: Ticket[];
  statuses: TicketStatusDef[];
  labelsByTicket: Record<number, TicketLabel[]>;
  checklistByTicket: Record<number, { done: number; total: number }>;
  projectMap: Record<number, string>;
  hasClaudeByTicket?: Record<number, boolean>;
  onCardClick: (ticket: Ticket) => void;
  onStatusChange: (ticketId: number, status: string) => Promise<void> | void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tickets,
  statuses,
  labelsByTicket,
  checklistByTicket,
  projectMap,
  hasClaudeByTicket,
  onCardClick,
  onStatusChange,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columns = useMemo(() =>
    [...statuses].sort((a, b) => a.sortOrder - b.sortOrder)
  , [statuses]);

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = {};
    for (const c of columns) map[c.key] = [];
    // Bucket "orphan" tickets whose status isn't in the dictionary into a
    // synthetic column so they don't silently disappear. Shouldn't happen
    // in practice but a UI that hides data is worse than one with a typo.
    const orphans: Ticket[] = [];
    for (const t of tickets) {
      if (map[t.status] !== undefined) map[t.status].push(t);
      else orphans.push(t);
    }
    if (orphans.length > 0) map['__orphans__'] = orphans;
    return map;
  }, [tickets, columns]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const ticketId = Number(String(active.id).replace('ticket-', ''));
    const colKey = String(over.id).replace('col-', '');
    const col = columns.find((c) => c.key === colKey);
    if (!col) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    if (ticket.status === col.key) return; // no-op drop
    await onStatusChange(ticketId, col.key);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
        {columns.map((col) => (
          <BoardColumn
            key={col.key}
            columnKey={col.key}
            title={col.displayName}
            color={col.color}
            count={grouped[col.key]?.length ?? 0}
          >
            {(grouped[col.key] || []).map((t) => (
              <BoardCard
                key={t.id}
                ticket={t}
                labels={labelsByTicket[t.id] || []}
                checklistTotal={(checklistByTicket[t.id]?.total) || 0}
                checklistDone={(checklistByTicket[t.id]?.done) || 0}
                projectName={projectMap[t.projectId]}
                hasClaude={hasClaudeByTicket?.[t.id]}
                onClick={() => onCardClick(t)}
              />
            ))}
          </BoardColumn>
        ))}
        {grouped['__orphans__'] && (
          <BoardColumn columnKey="__orphans__" title="(Unmapped status)" color="#9ca3af" count={grouped['__orphans__'].length}>
            {grouped['__orphans__'].map((t) => (
              <BoardCard
                key={t.id}
                ticket={t}
                labels={labelsByTicket[t.id] || []}
                checklistTotal={(checklistByTicket[t.id]?.total) || 0}
                checklistDone={(checklistByTicket[t.id]?.done) || 0}
                projectName={projectMap[t.projectId]}
                hasClaude={hasClaudeByTicket?.[t.id]}
                onClick={() => onCardClick(t)}
              />
            ))}
          </BoardColumn>
        )}
      </div>
    </DndContext>
  );
};

export default KanbanBoard;
