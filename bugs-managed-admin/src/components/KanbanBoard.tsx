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
import type { Ticket, TicketLabel } from '../api';

const { Text } = Typography;

// Status columns shown in the board. Keep tight — too many columns and the
// board feels sparse; common workflow is OPEN → IN_PROGRESS → IN_REVIEW → DONE.
// VERIFIED/READY_FOR_TESTING/CLOSED hide under "DONE" via render-mapping so
// drag-to-DONE picks RESOLVED as the default landing status.
const COLUMNS: Array<{ key: string; title: string; statuses: string[]; landing: string; color: string }> = [
  { key: 'OPEN', title: 'Open', statuses: ['OPEN'], landing: 'OPEN', color: '#fbbf24' },
  { key: 'IN_PROGRESS', title: 'In Progress', statuses: ['IN_PROGRESS'], landing: 'IN_PROGRESS', color: '#3b82f6' },
  { key: 'IN_REVIEW', title: 'In Review', statuses: ['IN_REVIEW', 'READY_FOR_TESTING', 'VERIFIED'], landing: 'IN_REVIEW', color: '#a855f7' },
  { key: 'DONE', title: 'Done', statuses: ['RESOLVED', 'CLOSED'], landing: 'RESOLVED', color: '#22c55e' },
];

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
  labelsByTicket: Record<number, TicketLabel[]>;
  checklistByTicket: Record<number, { done: number; total: number }>;
  projectMap: Record<number, string>;
  hasClaudeByTicket?: Record<number, boolean>;
  onCardClick: (ticket: Ticket) => void;
  onStatusChange: (ticketId: number, status: string) => Promise<void> | void;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tickets,
  labelsByTicket,
  checklistByTicket,
  projectMap,
  hasClaudeByTicket,
  onCardClick,
  onStatusChange,
}) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = {};
    for (const col of COLUMNS) map[col.key] = [];
    for (const t of tickets) {
      const col = COLUMNS.find((c) => c.statuses.includes(t.status));
      if (col) map[col.key].push(t);
    }
    return map;
  }, [tickets]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const ticketId = Number(String(active.id).replace('ticket-', ''));
    const colKey = String(over.id).replace('col-', '');
    const col = COLUMNS.find((c) => c.key === colKey);
    if (!col) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    // Skip no-ops: card dropped on its own column.
    if (col.statuses.includes(ticket.status)) return;
    await onStatusChange(ticketId, col.landing);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {COLUMNS.map((col) => (
          <BoardColumn
            key={col.key}
            columnKey={col.key}
            title={col.title}
            color={col.color}
            count={grouped[col.key].length}
          >
            {grouped[col.key].map((t) => (
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
      </div>
    </DndContext>
  );
};

export default KanbanBoard;
