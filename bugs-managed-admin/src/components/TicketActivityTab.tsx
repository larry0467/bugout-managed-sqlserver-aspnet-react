import React, { useEffect, useState } from 'react';
import { Timeline, Typography, Tag, Empty, Spin } from 'antd';
import {
  ClockCircleOutlined, UserSwitchOutlined, TagOutlined, CheckSquareOutlined,
  CalendarOutlined, MessageOutlined, NotificationOutlined, PictureOutlined,
} from '@ant-design/icons';
import { activityApi, type TicketActivity } from '../api';

const { Text } = Typography;

const kindMeta: Record<string, { color: string; icon: React.ReactNode }> = {
  STATUS_CHANGED: { color: 'blue', icon: <ClockCircleOutlined /> },
  ASSIGNED: { color: 'geekblue', icon: <UserSwitchOutlined /> },
  LABEL_ADDED: { color: 'magenta', icon: <TagOutlined /> },
  LABEL_REMOVED: { color: 'magenta', icon: <TagOutlined /> },
  CHECKLIST_ADDED: { color: 'green', icon: <CheckSquareOutlined /> },
  CHECKLIST_COMPLETED: { color: 'green', icon: <CheckSquareOutlined /> },
  DUE_DATE_SET: { color: 'orange', icon: <CalendarOutlined /> },
  NOTE_ADDED: { color: 'cyan', icon: <MessageOutlined /> },
  MENTIONED: { color: 'volcano', icon: <NotificationOutlined /> },
  SCREENSHOT_ADDED: { color: 'purple', icon: <PictureOutlined /> },
  CHAT_SCREENSHOT_ADDED: { color: 'purple', icon: <PictureOutlined /> },
};

interface Props {
  ticketId: number;
  active: boolean;
}

const TicketActivityTab: React.FC<Props> = ({ ticketId, active }) => {
  const [items, setItems] = useState<TicketActivity[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    activityApi.list(ticketId).then(setItems).finally(() => setLoading(false));
  }, [ticketId, active]);

  if (loading && !items) return <Spin />;
  if (!items || items.length === 0) return <Empty description="No activity yet" />;

  return (
    <Timeline
      style={{ marginTop: 8 }}
      items={items.map((a) => {
        const meta = kindMeta[a.kind] ?? { color: 'default', icon: <ClockCircleOutlined /> };
        return {
          color: meta.color,
          dot: meta.icon,
          children: (
            <div>
              <Text>{a.message}</Text>
              <div>
                <Tag style={{ fontSize: 10 }}>{a.kind}</Tag>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {new Date(a.createdAt).toLocaleString()}
                </Text>
              </div>
            </div>
          ),
        };
      })}
    />
  );
};

export default TicketActivityTab;
