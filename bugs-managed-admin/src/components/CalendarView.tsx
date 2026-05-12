import React, { useMemo } from 'react';
import { Calendar, Badge, Tag, Tooltip, Empty } from 'antd';
import type { Ticket } from '../api';
import type { Dayjs } from 'dayjs';

const priorityColors: Record<string, 'red' | 'orange' | 'blue' | 'default'> = {
  CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'default',
};

interface Props {
  tickets: Ticket[];
  onCardClick: (ticket: Ticket) => void;
}

const CalendarView: React.FC<Props> = ({ tickets, onCardClick }) => {
  const withDue = useMemo(() => tickets.filter((t) => t.dueDate), [tickets]);

  // Bucket by ISO date so dateCellRender is O(1) per day.
  const byDate = useMemo(() => {
    const m: Record<string, Ticket[]> = {};
    for (const t of withDue) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = d.toISOString().slice(0, 10);
      (m[key] ??= []).push(t);
    }
    return m;
  }, [withDue]);

  const dateCellRender = (value: Dayjs) => {
    const key = value.format('YYYY-MM-DD');
    const list = byDate[key];
    if (!list || list.length === 0) return null;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.slice(0, 4).map((t) => {
          const overdue = new Date(t.dueDate!).getTime() < todayStart.getTime()
            && t.status !== 'RESOLVED' && t.status !== 'CLOSED';
          return (
            <li key={t.id} onClick={(e) => { e.stopPropagation(); onCardClick(t); }} style={{ cursor: 'pointer', marginBottom: 2 }}>
              <Tooltip title={t.title} placement="topLeft">
                <Badge
                  status={overdue ? 'error' : (priorityColors[t.priority] === 'red' ? 'error' : priorityColors[t.priority] === 'orange' ? 'warning' : 'processing')}
                  text={<span style={{ fontSize: 11 }}>{t.title}</span>}
                />
              </Tooltip>
            </li>
          );
        })}
        {list.length > 4 && <li><Tag style={{ fontSize: 10 }}>+{list.length - 4} more</Tag></li>}
      </ul>
    );
  };

  if (withDue.length === 0) {
    return <Empty description="No tickets with a due date" style={{ padding: 40 }} />;
  }

  return (
    <Calendar
      cellRender={(current, info) => (info.type === 'date' ? dateCellRender(current) : info.originNode)}
    />
  );
};

export default CalendarView;
